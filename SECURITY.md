# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

---

## Reporting a Vulnerability

We take the safety and integrity of user storage extremely seriously. If you discover a security vulnerability or a scenario where StorageRelief could inadvertently flag critical system or user files for deletion, please report it immediately:

1. **Do not create a public GitHub issue.**
2. Send an email to the repository maintainer or open a private GitHub Security Advisory.
3. Include detailed steps to reproduce the issue, OS version, and affected paths.

We will acknowledge receipt within 48 hours and work on an expedited fix.

---

## Safe Deletion Architecture

StorageRelief enforces multiple protective safeguards against data loss:

- **Explicit User Selection:** Only items checked by the user are sent to the deletion engine.
- **Safety Categories:** Every discovered item has a verified risk level (`safe`, `review`, `caution`). Items marked `review` or `caution` are **never selected by default**.
- **Self-Protection:** StorageRelief detects its own path and prevents deleting its own active target, binaries, or working directories.
- **Preview & Confirmation Modal:** Before any file is modified or removed, users are shown an itemized list with individual file sizes and the total disk space to be freed.
- **File Explorer Inspection:** Every card provides an "Open in File Explorer" button allowing users to visually inspect folders before confirming deletion.
