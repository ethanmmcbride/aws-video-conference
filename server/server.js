import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { randomUUID } from "crypto";


import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";


dotenv.config();


const app = express();
app.use(express.json({ limit: "16mb" }));
app.use(cors({ origin: "http://localhost:5173", credentials: true }));


// HTTP server for Socket.IO
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
cors: { origin: "http://localhost:5173", methods: ["GET", "POST"] },
});

// AWS + DB setup
const REGION = process.env.AWS_REGION;
const TABLE = process.env.TABLE; // DynamoDB table for chat
const S3_BUCKET = process.env.S3_BUCKET; // Bucket for recordings


const ddb = new DynamoDBClient({ region: REGION });
const doc = DynamoDBDocumentClient.from(ddb);
const s3 = new S3Client({ region: REGION, 
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
 });


// ————— Chat (REST) —————
app.post("/rooms/:roomId/messages", async (req, res) => {
  try {
    const { roomId } = req.params;
    const { senderId, text } = req.body;
    if (!senderId || !text) return res.status(400).json({ error: "senderId and text required" });


    const now = new Date().toISOString();
    const messageId = randomUUID();
    const item = {
      roomId,
      ts: `${now}#${messageId}`,
      messageId,
      senderId,
      text,
      type: "text",
    };


    await doc.send(new PutCommand({ TableName: TABLE, Item: item }));
    res.status(201).json(item);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "failed to write message" });
  }
});

app.get("/rooms/:roomId/messages", async (req, res) => {
  try {
    const { roomId } = req.params;
    const limit = Number(req.query.limit ?? 100);
    const out = await doc.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "roomId = :r",
        ExpressionAttributeValues: { ":r": roomId },
        ScanIndexForward: true,
        Limit: limit,
      })
    );
    res.json(out.Items ?? []);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "failed to load messages" });
  }
});


// ————— S3 presigned URLs —————
app.get("/s3/sign-put", async (req, res) => {
  try {
    const { filename = `recording.webm`, contentType = "video/webm", roomId = "default" } = req.query;
    console.log("[/s3/sign-put] incoming", { filename, contentType, roomId });
    const key = `recordings/${roomId}/${Date.now()}-${filename}`;
    
    const putCmd = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ContentType: contentType,
      // NOTE: Do NOT set ACL unless you KNOW the bucket allows ACLs.
      // ACL: "private",
    });
    const url = await getSignedUrl(s3, putCmd, { expiresIn: 60 });
    console.log("[/s3/sign-put] signed", { bucket: S3_BUCKET, key, region: REGION });
    res.json({ url, key, bucket: S3_BUCKET });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to create presigned PUT URL" });
  }
});


app.get("/s3/sign-get", async (req, res) => {
  try {
    const { key } = req.query;
    if (!key) return res.status(400).json({ error: "key required" });
      const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }), { expiresIn: 60 });
      res.json({ url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to create presigned GET URL" });
  }
});


// ————— Socket.IO WebRTC signaling —————
io.on("connection", (socket) => {
  let currentRoom = null;

  socket.on("join", ({ roomId, senderId }) => {
    currentRoom = roomId;
    socket.join(roomId);
    socket.data.senderId = senderId;
  });

  socket.on("leave", ({ roomId }) => {
    socket.leave(roomId);
    currentRoom = null;
  });

  // Forward signaling messages to everyone else in the room
  socket.on("signal", (msg) => {
    if (!msg?.roomId) return;
    socket.to(msg.roomId).emit("signal", msg);
  });

  socket.on("disconnect", () => {
    if (currentRoom) socket.leave(currentRoom);
  });
});


const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => 
  console.log(`API + Socket.IO listening on :${PORT}`)
);