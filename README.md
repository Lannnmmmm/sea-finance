# Sea-Finance

Personal finance reporting system based on monthly SeaBank e-Statements.

## Stack

- Google Apps Script — backend and automation
- Google Sheets — initial database and reporting data
- Google Drive — private PDF archive
- HTML/CSS/JavaScript — web interface
- GitHub — private source-code version control

## Project status

- [x] Analyze sample SeaBank statement format
- [x] Document initial system design
- [ ] Create Google Sheets database schema
- [ ] Implement and test PDF parser
- [ ] Add reconciliation and duplicate protection
- [ ] Build upload/review interface
- [ ] Build dashboard and reports

## Important

Do not commit bank statements, account numbers, personal addresses, credentials, or real transaction exports to this repository. Store original PDFs in a private Google Drive folder. Keep this repository Private.

See [System Design](docs/system-design.md) for architecture, data model, validation rules, and implementation phases.
