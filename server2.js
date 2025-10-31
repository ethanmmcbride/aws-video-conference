import express from "express";
import dotenv from "dotenv";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";
import cors from "cors";

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors({ origin: "http://localhost:5173" }));

const ddb = new DynamoDBClient({ region: process.env.AWS_REGION });
const doc = DynamoDBDocumentClient.from(ddb);
const TABLE = process.env.TABLE;

// POST /rooms/:roomId/messages  -> write one message
app.post("/rooms/:roomId/messages", async (req, res) => {
  const { roomId } = req.params;
  const { senderId, text } = req.body;
  const now = new Date().toISOString();
  const messageId = randomUUID();
  const item = {
    roomId,
    ts: `${now}#${messageId}`,  // keeps strict chronological order
    messageId,
    senderId,
    text,
    type: "text",
  };
  await doc.send(new PutCommand({ TableName: TABLE, Item: item }));
  res.status(201).json(item);
});

// GET /rooms/:roomId/messages?limit=50  -> fetch recent messages
app.get("/rooms/:roomId/messages", async (req, res) => {
  const { roomId } = req.params;
  const limit = Number(req.query.limit ?? 50);
  const out = await doc.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: "roomId = :r",
    ExpressionAttributeValues: { ":r": roomId },
    ScanIndexForward: true, // oldest -> newest
    Limit: limit
  }));
  res.json(out.Items ?? []);
});

app.listen(4000, () => console.log("API on :4000"));
