import { useEffect, useMemo, useRef, useState } from "react";
import io from "socket.io-client";

const API = "http://localhost:4000"; // Express + Socket.IO server

export default function App() {
  // —— Chat state ——
  const [roomId, setRoomId] = useState("roomA"); // The current chat room identifier
  const [senderId, setSenderId] = useState("alice"); // Identifier for the current user that's sending messages
  const [text, setText] = useState(""); // The state for the current input field value (new message text)
  const [messages, setMessages] = useState([]); // The array to store all the received as well as sent chat messages

  // —— WebRTC state ——
  const socketRef = useRef(null); // The reference to the Socket.IO client instance for purposes of signaling
  const pcRef = useRef(null); // The reference to the RTCPeerConnection instance 
  const localVideoRef = useRef(null); // The reference to the DOM element that's displaying the user's local stream
  const remoteVideoRef = useRef(null); // The reference to the DOM element that's displaying the remote peer's stream
  const [localStream, setLocalStream] = useState(null); // Tracks the LocalStream object for the user's camera/mic
  const [remoteStream, setRemoteStream] = useState(null); // Tracks the RemoteStream object for the remote user's feed
  const [screenStream, setScreenStream] = useState(null); // Tracks the ScreenStream object when sharing the screen

  // —— Recording state ——
  const [recorder, setRecorder] = useState(null);
  const [recordedBlobs, setRecordedBlobs] = useState([]); // Array to store chunks of media data during recording

  const pendingRemoteIceRef = useRef([]);

  // Socket connection (memoized so we create once)
  const socket = useMemo(() => {
    if (!socketRef.current) {
      socketRef.current = io(API, {
        transports: ["websocket"],
        forceNew: true,
        autoConnect: false,
      });
    }
    return socketRef.current;
  }, []);

  // Join/leave room when roomId changes
  useEffect(() => {
    if (!socket) return;

    function flushQueuedIce(pc) {
      if (!pc?.remoteDescription) return;
      for (const c of pendingRemoteIceRef.current) {
        pc.addIceCandidate(c).catch(err => console.error("Queued ICE failed", err));
      }
      pendingRemoteIceRef.current = [];
    }

    const onSignal = async (payload) => {
      const { type, sdp, candidate } = payload;
      const pc = getOrCreatePeer();

      if (type === "offer" && sdp) {
        await pc.setRemoteDescription({ type: "offer", sdp });
        if (localStream) {
          localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
        } else if (pc.getTransceivers().length === 0) {
          ["video","audio"].forEach(kind =>
            pc.addTransceiver(kind, { direction: "recvonly" })
          );
        }
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("signal", { roomId, type: "answer", sdp: answer.sdp, senderId });
        flushQueuedIce(pc);

      } else if (type === "answer" && sdp) {
        await pc.setRemoteDescription({ type: "answer", sdp });
        flushQueuedIce(pc);

      } else if (type === "ice" && candidate) {
        if (!pc.remoteDescription) {
          pendingRemoteIceRef.current.push(candidate);
        } else {
          try { await pc.addIceCandidate(candidate); }
          catch (e) { console.error("addIceCandidate failed", e); }
        }
      }
    };

    const onConnect = () => {
      socket.emit("join", { roomId, senderId });
    };

    socket.on("connect", onConnect);
    socket.on("signal", onSignal);
    socket.connect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("signal", onSignal);
      socket.emit("leave", { roomId, senderId });
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, senderId]);
  // Chat: fetch (simple polling)
  useEffect(() => {
    let timer;
    const load = async () => {
      const res = await fetch(`${API}/rooms/${roomId}/messages?limit=200`);
      const items = await res.json();
      setMessages(items);
    };
    load();
    timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [roomId]);

  async function sendChat(e) {
    e.preventDefault();
    if (!text.trim()) return;
    const res = await fetch(`${API}/rooms/${roomId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderId, text, type: "text" }),
    });
    const msg = await res.json();
    setText("");
    setMessages((m) => [...m, msg]);
  }

  // —— WebRTC helpers ——
  function getOrCreatePeer() {
    if (pcRef.current) return pcRef.current;

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        // Add TURN here for production reliability
        // { urls: "turn:YOUR_TURN", username: "user", credential: "pass" }
      ],
    });

  

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("signal", { roomId, type: "ice", candidate: e.candidate, senderId });
      }
    };

    const inbound = new MediaStream();
    pc.ontrack = (evt) => {
      evt.streams[0].getTracks().forEach((t) => inbound.addTrack(t));
      setRemoteStream(inbound);
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = inbound;
    };

    pcRef.current = pc;
    return pc;
  }

  async function startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    setLocalStream(stream);
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
  }

  async function shareScreen() {
    // Try to capture screen + system audio (browser-dependent); fall back to mic.
    let screen;
    try {
      screen = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    } catch (e) {
      // Some browsers disallow system audio; try without
      screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
    }

    // Add mic to the screen stream if it lacks audio
    if (!screen.getAudioTracks().length) {
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        mic.getAudioTracks().forEach((t) => screen.addTrack(t));
      } catch (_) {
        // ignore if mic not granted
      }
    }

    const videoTrack = screen.getVideoTracks()[0];
    const audioTrack = screen.getAudioTracks()[0];

    // Switches back to camera once stopped sharing screen
    videoTrack.onended = async () => {
      await startCamera();
      const cameraTrack = localStream.getVideoTracks()[0];
      const senders = pcRef.current.getSenders();
      const send = senders.find((s) => s.track && s.track.kind === "video");

      if (cameraTrack && send){send.replaceTrack(cameraTrack);}
    }

    setScreenStream(screen);
    setLocalStream(screen);
    if (localVideoRef.current) localVideoRef.current.srcObject = screen;

    // If already in a call, replace outgoing tracks
    if (pcRef.current) {
      const senders = pcRef.current.getSenders();
      if (videoTrack) {
        const vs = senders.find((s) => s.track && s.track.kind === "video");
        if (vs) await vs.replaceTrack(videoTrack);
      }
      if (audioTrack) {
        const as = senders.find((s) => s.track && s.track.kind === "audio");
        if (as) await as.replaceTrack(audioTrack);
      }
    }

    
  }

  async function startCall() {
    const pc = getOrCreatePeer();
    // Add local tracks (camera or screen)
    const base = localStream;
    if (!localStream) return alert("Start camera or share screen first.");
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("signal", { roomId, type: "offer", sdp: offer.sdp, senderId });
  }

  function hangUp() {
    try { recorder?.state === "recording" && recorder.stop(); } catch {}

    if (pcRef.current) {
      pcRef.current.getSenders().forEach((s) => s.track && s.track.stop());
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStream) localStream.getTracks().forEach((t) => t.stop());
    if (screenStream) screenStream.getTracks().forEach((t) => t.stop());
    setLocalStream(null);
    setScreenStream(null);
    setRemoteStream(null);
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  }

  // —— Recording (Screen or Local/Remote) ——
  function startRecording(which = "screen") {
    let streamToRecord = null;
    if (which === "screen" && screenStream) streamToRecord = screenStream;
    if (!streamToRecord) streamToRecord = localStream || remoteStream; // fallback
    if (!streamToRecord) return alert("Nothing to record yet.");

    const chunks = [];
    const mr = new MediaRecorder(streamToRecord, { mimeType: "video/webm;codecs=vp9,opus" });
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mr.onstop = () => setRecordedBlobs(chunks);
    mr.start(1000);
    setRecorder(mr);
  }

  function stopRecording() {
    if (recorder && recorder.state === "recording") recorder.stop();
  }

  async function uploadRecording() {
    if (!recordedBlobs.length) return alert("No recording available.");
    const blob = new Blob(recordedBlobs, { type: "video/webm" });
    const filename = `${senderId}-${Date.now()}.webm`;

    console.log("[uploadRecording] start", { size: blob.size, type: blob.type, filename, roomId });
    const presignUrl = `${API}/s3/sign-put?filename=${encodeURIComponent(filename)}&contentType=${encodeURIComponent(blob.type)}&roomId=${encodeURIComponent(roomId)}`;
    let url, key, bucket;
    try {
      const urlRes = await fetch(presignUrl);
      const json = await urlRes.json().catch(() => ({}));
      console.log("[uploadRecording] presign response", { status: urlRes.status, json });
      if (!urlRes.ok || json?.error) {
        alert(`Failed to get upload URL (HTTP ${urlRes.status})`);
        return;
      }
      ({ url, key, bucket } = json);
    } catch (e) {
      console.error("[uploadRecording] presign fetch error", e);
      alert("Failed to get upload URL (network error). See console.");
      return;
    }


    try {
      // If your bucket policy enforces SSE-S3 (AES256), UNCOMMENT the SSE header.
      // (Must match what the server signed; if server didn’t include SSE in the presign, don’t send it.)
      const headers = { "Content-Type": blob.type };
      // headers["x-amz-server-side-encryption"] = "AES256";

      const put = await fetch(url, { method: "PUT", headers, body: blob });
      const bodyText = await put.text().catch(() => "(no response body)");
      console.log("[uploadRecording] PUT result", { status: put.status, ok: put.ok, body: bodyText });
      if (!put.ok) {
        alert(`Upload failed (HTTP ${put.status}). See console for details.`);
        return;
      }
      // Success! ETag is the canonical success signal.
      console.log("[uploadRecording] success ETag:", put.headers.get("ETag"));
      alert(`Uploaded to s3://${bucket}/${key}`);
    } catch (e) {
      console.error("[uploadRecording] PUT network error", e);
      alert("Upload failed (network error). See console.");
    }
  }

  return (
    <div style={{ margin: "30px", fontFamily: "Inter, system-ui, sans-serif" }}>
      <h2>Chat + WebRTC (Socket.IO signaling)</h2>

      <div style={{ display: "grid", gridTemplateColumns: "1fr .5fr", gap: 16 }}>
        <div>
          <div style={{ display: "grid",  gridTemplateColumns: ".5fr 1fr" }}>
            <label>
              Room ID:{" "}
              <input value={roomId} onChange={(e) => setRoomId(e.target.value)} style={{border: "1px solid #eee", borderRadius: 8, padding: 10}} />
            </label>
            <label>
              Sender ID (Name):{" "}
              <input value={senderId} onChange={(e) => setSenderId(e.target.value)} style={{border: "1px solid #eee", borderRadius: 8, padding: 10}}/>
            </label>
          </div>


          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <h4 style={{ margin: 0 }}>Local</h4>
              <video ref={localVideoRef} playsInline autoPlay muted style={{ width: "100%", height: "100%", border: "1px solid #626161ff", borderRadius: 8 }} />
            </div>
            <div>
              <h4 style={{ margin: 0 }}>Remote</h4>
              <video ref={remoteVideoRef} playsInline autoPlay style={{ width: "100%", height: "100%", border: "1px solid #626161ff", borderRadius: 8 }} />
            </div>
          </div>

          <div style={{ marginTop: 120, display: "flex", gap: 20 }}>
            <button onClick={startCall}>Join/Start Call</button>
            <button onClick={startCamera}><img src="/public/cameraIcon.png" alt="Camera Icon" style={{height:"60px", width:"60px"}}/></button>
            <button onClick={shareScreen}><img src="/public/shareIcon.png" alt="Share Screen Icon" style={{height:"60px", width:"60px"}}/></button>
            <button onClick={() => startRecording("screen")} disabled={recorder && recorder.state === "recording"}><img src="/public/recordIcon.png" alt="RecordIcon" style={{height:"45px", width:"45px"}}/></button>
            <button onClick={stopRecording} disabled={!recorder || recorder.state !== "recording"}>Stop Recording</button>
            <button onClick={uploadRecording} disabled={!recordedBlobs.length}>Upload to S3</button>
            <button onClick={hangUp} style={{background:"#EB5757"}}>Hang Up</button>
          </div>

        </div>

        <div>
          <h3 style={{ marginTop: 0 }}>Messages (Room: {roomId})</h3>
          <form onSubmit={sendChat} style={{ display: "flex", gap: 8 }}>
            <input
              placeholder="Type a message"
              value={text}
              onChange={(e) => setText(e.target.value)}
              style={{ flex: 1, border: "1px solid #eee", borderRadius: 8, padding: 10,  }}
            />
            <button disabled={!text.trim()}>Send</button>
          </form>

          <div style={{ marginTop: 12, height: 360, overflowY: "auto", border: "1px solid #626161ff", borderRadius: 8, padding: 10 }}>
            {messages.length === 0 && <div style={{ opacity: 0.6 }}>No messages yet.</div>}
            {messages.map((m, idx) => {
              const ts = m.ts ? new Date(m.ts.split("#")[0]) : null;
              return (
                <div key={m.messageId ?? idx} style={{  border: "1px solid #8d8b8bff", borderRadius: 8, padding: 8, marginBottom: 8 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <strong>{m.senderId ?? "unknown"}</strong>
                    {ts && <small style={{ opacity: 0.6 }}>{ts.toLocaleString()}</small>}
                  </div>
                  <div style={{ marginTop: 4 }}>{m.text}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
