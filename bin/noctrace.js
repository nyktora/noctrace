#!/usr/bin/env node
import { startServer } from '../dist/server/server/index.js';
import open from 'open';

const port = await startServer();
const url = `http://localhost:${port}`;
await open(url);
