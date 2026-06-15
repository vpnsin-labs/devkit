#!/usr/bin/env node
// Scratch — edit freely. `temp/` is git-ignored.
// Run: node temp/format.js

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

const res = await fetch(`${BASE}/health`);
const data = await res.json();
console.log(JSON.stringify(data, null, 2));
