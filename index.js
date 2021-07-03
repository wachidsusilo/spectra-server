import express from 'express';
import cors from 'cors';
import WebSocket from 'ws';
import http from 'http';
import httpRoute from './route/httpRoute.js';
import { onConnection } from './route/socketRoute.js';


const app = express();
app.use(express.json());
app.use(express.urlencoded({extended: true}));
app.use(cors());
app.use('/', httpRoute);

const server = http.createServer(app);
export const ws = new WebSocket.Server({server});
ws.on('connection', onConnection);

const PORT = process.env.PORT || 5000;
server.listen(PORT);
