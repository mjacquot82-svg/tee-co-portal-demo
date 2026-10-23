# Duplicate customer profiles: report and proposed merge

**Nothing here has been run.** No customer data was changed.

1. `customer-duplicates-report.sql` is read-only. It lists profiles that share a login, an email, a phone number or a name. For each one it shows how many orders, artwork files and payments are attached, and which profile it suggests keeping. You can run it any time in the Supabase SQL editor.
2. `customer-duplicates-merge-PROPOSED-NOT-RUN.sql` is a proposal. You list the pairs to merge by hand. It moves everything onto the kept profile, saves a backup of the removed profile in `tee_co_private.customer_merge_backup`, and ends in `ROLLBACK`, so the first run is only a preview. Run it on staging first. Only change it to `COMMIT` after Marc has reviewed the preview.

In the Oct 16 read-only backup of live, 4 logins are each linked to 2 customer profiles. These are most likely the "4 duplicates", and the report lists them first. Email, phone and name matches also show up, but they are weaker signals (for example, family members can share a phone number).
