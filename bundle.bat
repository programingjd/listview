@echo off
deno run -A npm:rolldown -c
brotli -kZf dist/listview-min.mjs
brotli -kZf dist/listview-min.mjs.map