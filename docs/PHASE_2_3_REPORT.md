# Phases 2 and 3 report: database, identity, product, frontend

Decisions taken (you asked for "whatever gives the best result"; all are changeable):
1. **Risk policy**: low below the model threshold (0.32); medium to 0.50; high at 0.50+. The new model's calibration was
   measured (ECE 0.018), so 0.50 reads as roughly even odds. It remains a business policy that you must approve.
2. **Layout**: `backend/` + `frontend/` monorepo (done with `git mv`).
3. **Hosting**: see `docs/DEPLOYMENT.md` (decision still needed from you).
4. **Retention**: deleting an account deletes its customers, predictions, jobs and sessions; audit rows are kept without identity
   (365 days). Deleting a customer deletes its predictions. Email: any SMTP provider.
5. **Bulk prediction**: included in release 1 (synchronous-safe job with real status, 5,000 rows / 5 MB).
6. **Retraining**: done with a leakage-free protocol (model v1.1.0).

See the chat summary for verified results.
