#!/usr/bin/env python3
"""Static server for the Stacy's model workbench.

ES modules need real HTTP (not file://). No-cache headers so edits to
js/stacys.js show up on Rebuild without fighting the browser module cache.

    python serve.py            -> http://localhost:8090
    python serve.py 9000       -> http://localhost:9000
    python serve.py --lan      -> also reachable from your phone on the same WiFi

--lan binds 0.0.0.0 instead of loopback, which exposes the directory to every
device on the network, so it is opt-in. Windows will prompt for a firewall
exception the first time.
"""
import socket
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "favicon" not in (args[0] if args else ""):
            super().log_message(fmt, *args)


def lan_ip():
    """This machine's address on the local network (no traffic is actually sent)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


def main():
    args = [a for a in sys.argv[1:] if a != "--lan"]
    lan = "--lan" in sys.argv
    port = int(args[0]) if args else 8090
    host = "0.0.0.0" if lan else "127.0.0.1"
    handler = partial(NoCacheHandler, directory=".")
    with ThreadingHTTPServer((host, port), handler) as srv:
        print(f"Stacy's model workbench -> http://localhost:{port}")
        if lan:
            ip = lan_ip()
            if ip:
                print(f"on your phone (same WiFi)  -> http://{ip}:{port}/pocket.html")
            else:
                print("could not determine this machine's LAN address")
        print("Ctrl+C to stop")
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped")


if __name__ == "__main__":
    main()
