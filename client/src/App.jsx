import { useEffect, useState } from "react";

export default function App() {
  const [roomId, setRoomId] = useState("roomA");
  const [senderId, setSenderId] = useState("alice");
  const [text, setText] = useState("");
  const [messages, setMessages] = useState([]);

  const API = "http://localhost:4000";

  async function sendMessage(e) {
    e.preventDefault();
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
    const res = await fetch(`${API}/rooms/${roomId}/messages?limit=50`);
    const items = await res.json();
    setMessages(items);
  }

  useEffect(() => {
    fetchMessages();
    const id = setInterval(fetchMessages, 2000); // simple polling
    return () => clearInterval(id);
  }, [roomId]);

  return (
    <div style={{ maxWidth: 640, margin: "2rem auto", fontFamily: "sans-serif", marginLeft: "200px" }}>
      <h2>DynamoDB testing and Room Creation</h2>
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

      
    </div>
  );
}