# WebRTC Chat & Video Call Application

A real-time chat and video conferencing application built with React, Express, Socket.IO, and WebRTC. Features include video/audio calls, screen sharing, recording, and message persistence using AWS DynamoDB and S3.

## Features

- **Real-time Chat**: Text messaging with room support
- **Video Calls**: Peer-to-peer video and audio communication
- **Screen Sharing**: Share your screen with system audio (browser-dependent)
- **Recording**: Record video streams and upload to S3
- **Room-based**: Multiple isolated rooms for different conversations
- **Message Persistence**: Chat history stored in DynamoDB
- **WebRTC Signaling**: Socket.IO-based signaling for peer connections

## Tech Stack

**Frontend:**
- React with Hooks
- Socket.IO Client
- WebRTC API
- MediaRecorder API

**Backend:**
- Express.js
- Socket.IO Server
- AWS SDK v3 (DynamoDB, S3)
- Node.js

**Infrastructure:**
- AWS DynamoDB (chat storage)
- AWS S3 (recording storage)
- STUN servers (Google's public STUN)

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- AWS Account with:
  - DynamoDB table
  - S3 bucket
  - IAM credentials with appropriate permissions

## Installation

### 1. Clone the repository

```bash
git clone <repository-url>
cd <project-directory>
```

### 2. Install dependencies

**Backend:**
```bash
cd server
npm install
```

**Frontend:**
```bash
cd client
npm install
```

### 3. Environment Setup

Create a `.env` file in the server directory:

```env
# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# DynamoDB
TABLE=your_table_name

# S3
S3_BUCKET=your_bucket_name

# Server
PORT=4000
```

### 4. AWS Setup

**DynamoDB Table:**
- Table name: (as specified in `.env`)
- Partition key: `roomId` (String)
- Sort key: `ts` (String)

**S3 Bucket:**
- Create a bucket for storing recordings
- Configure CORS to allow PUT requests from your frontend origin
- Example CORS configuration:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedOrigins": ["http://localhost:5173"],
    "ExposeHeaders": ["ETag"]
  }
]
```

**IAM Permissions:**
Your AWS credentials need:
- `dynamodb:PutItem`
- `dynamodb:Query`
- `s3:PutObject`
- `s3:GetObject`

## Running the Application

### Start the Backend Server

```bash
cd server
npm run dev  # or node server.js
```

Server runs on `http://localhost:4000`

### Start the Frontend

```bash
cd client
npm run dev
```

Frontend runs on `http://localhost:5173`

## Usage

### Basic Chat

1. Open the application in your browser
2. Enter a room ID and your name (sender ID)
3. Type messages and click "Send"
4. Messages are stored in DynamoDB and persist across sessions