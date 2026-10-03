# Cost & Budget

> Source: [DESIGN.md](DESIGN.md) § Budget
>
> Azure for Students: **$100 credit, 12 months**

---

## Budget Table

| Service | Cost Behavior | Risk | Notes |
|---|---|---|---|
| Container Apps | 180,000 vCPU-seconds + 2M requests free every month | Low — a student-scale burst won't approach this | Workers and API both scale to 0 |
| Document Intelligence | 500 pages/month free (F0), capped at 2 pages per document and 4 MB per file | Medium — a real burst test can't run against it directly; see the stub-extractor approach | Training the custom model itself is free regardless of tier |
| Blob Storage, Event Grid, Functions, SignalR | Free monthly grants well above project scale | Low | — |
| Service Bus | Basic tier, roughly $0.05 per million operations | Low | — |
| Container Registry | Basic tier, roughly $5/month flat — not inside Container Apps' free grant | Low | Must exist before first CI/CD push |
| Key Vault | Pay-per-operation, a few cents at this scale | Small but real | — |
| Application Insights / Log Analytics | Free data-ingestion allowance covers a student project's volume | Low | — |
| **PostgreSQL Flexible Server** | **Not free — bills hourly while running, roughly $12–15/month if left on continuously** | **Main cost driver** | ⚠️ See mitigation below |

---

## Cost Guardrails

1. **Keep Container Apps minimum replicas at 0** so workers scale to zero when idle.
2. **Stop (not delete) the PostgreSQL server between work sessions;** only storage bills while stopped.
3. **Use the stub extractor for load tests** to avoid burning Document Intelligence F0 quota.
4. **Budget estimate** for a full build–test–demo–viva cycle: **$20–40** of the $100 credit, driven mainly by active Postgres hours plus the Container Registry's flat fee.
5. **Use one dedicated resource group** so teardown is one `az group delete` command.

---

## ⚠️ PostgreSQL 7-Day Auto-Restart Reminder

> **A stopped Flexible Server only stays stopped for seven days before Azure auto-restarts it and billing resumes.**

Set a reminder to re-stop it, or automate the stop with a scheduled Azure Automation runbook.

### Suggested reminders

- Set a recurring calendar reminder every 6 days to check the Postgres server status.
- Alternatively, create an Azure Automation runbook that stops the server on a schedule.
- After each work session, run: `az postgres flexible-server stop --resource-group <rg> --name <server>`
