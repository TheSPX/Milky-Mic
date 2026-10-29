# Security

Milky Mic sends audio over your local Wi-Fi without encryption, and protects the PC with a pairing code. Please read "Honest limitations" in the [README](README.md) before using it on a network you do not trust.

## Reporting a problem

Please do **not** open a public issue for a security problem. Use GitHub's private reporting instead: on the repository go to **Security → Report a vulnerability**. (Repository owners: turn on "Private vulnerability reporting" under Settings → Code security.)

Include what you found, how to reproduce it, and what it could let someone do.

## What is already in place

- The website and its control channel only answer the PC itself (loopback), and only for the page's own origin.
- A phone must send the pairing code. Five wrong tries lock an address out for a minute; a flood of wrong tries changes the code.
- Codes are compared in constant time.
