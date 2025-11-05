import { useEffect, useRef, useState } from "react";

export default function App() {
  const [roomId, setRoomId] = useState("roomA");
  const [senderId, setSenderId] = useState("alice");
  const [text, setText] = useState("");
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const API = "http://localhost:4000";
  const listRef = useRef(null);

  async function sendMessage(e) {
    e.preventDefault();
    if (!text.trim()) return;
    const res = await fetch(`${API}/rooms/${roomId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senderId, text })
    });
    const msg = await res.json();
    setText("");
    // optimistic update
    setMessages((m) => [...m, msg]);
  }

  async function fetchMessages() {
    try {
      setIsLoading(true);
      const res = await fetch(`${API}/rooms/${roomId}/messages?limit=50`);
      const items = await res.json();
      setMessages(items);
    } finally {
      setIsLoading(false);
    }
  }

  // Fetch on mount and whenever room changes
  useEffect(() => {
    fetchMessages();
    const id = setInterval(fetchMessages, 2000); // simple polling
    return () => clearInterval(id);
  }, [roomId]);

  // Auto-scroll to the latest message when messages change
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div style={{ maxWidth: 640, margin: "2rem auto", fontFamily: "sans-serif", marginLeft: "200px" }}>
      <h2>Chat Feature Testing Using DynamoDB</h2>
      <div style={{ display: "grid", gap: 8 }}>
        <label>
          Room ID:{" "}
          <input value={roomId} onChange={(e) => setRoomId(e.target.value)} />
        </label>
        <label>
          Sender ID:{" "}
          <input value={senderId} onChange={(e) => setSenderId(e.target.value)} />
        </label>
        <form onSubmit={sendMessage} style={{ display: "flex", gap: 8 }}>
          <input
            placeholder="Type a message"
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={{ flex: 1 }}
          />
          <button disabled={!text.trim()}>Send</button>
        </form>
      </div>

      {/* Messages list */}
      <div style={{ marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <h3 style={{ margin: 0 }}>Messages</h3>
          <small style={{ opacity: 0.7 }}>(Room: {roomId})</small>
          {isLoading && <small style={{ marginLeft: "auto", opacity: 0.7 }}>Loading…</small>}
        </div>
        <div
          ref={listRef}
          style={{
            border: "1px solid #ddd",
            borderRadius: 8,
            padding: 12,
            height: 320,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            background: "#fafafa"
          }}
        >
          {(!messages || messages.length === 0) && (
            <div style={{ opacity: 0.6 }}>No messages yet. Be the first to say hi 👋</div>
          )}
          {messages &&
            messages.map((m, idx) => {
              const key = m.id ?? `${m.senderId}-${m.createdAt ?? idx}`;
              const ts = m.createdAt ? new Date(m.createdAt) : null;
              return (
                <div
                  key={key}
                  style={{
                    background: "white",
                    border: "1px solid #eee",
                    borderRadius: 8,
                    padding: 10
                  }}
                >
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
  );
}
