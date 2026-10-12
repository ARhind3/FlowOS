#!/usr/bin/env python3
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import os
os.chdir(os.path.dirname(__file__))
print('FlowOS Logic MVP: http://127.0.0.1:8080')
ThreadingHTTPServer(('127.0.0.1', 8080), SimpleHTTPRequestHandler).serve_forever()
