import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

const ddb = new DynamoDBClient({ region: process.env.AWS_REGION });
const doc = DynamoDBDocumentClient.from(ddb);

export async function writeTest() {
  const now = new Date().toISOString();
  const item = { roomId: "roomA", ts: `${now}#demo`, senderId: "you", text: "hello!" };
  await doc.send(new PutCommand({ TableName: process.env.TABLE, Item: item }));
  console.log("Wrote item");
}

export async function readTest() {
  const out = await doc.send(new QueryCommand({
    TableName: process.env.TABLE,
    KeyConditionExpression: "roomId = :r",
    ExpressionAttributeValues: { ":r": "roomA" },
  }));
  console.log(out.Items);
}
