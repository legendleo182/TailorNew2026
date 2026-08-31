# Salesman assignment verification

The customer add and edit dialogs were verified on desktop. Both dialogs place the required Salesman selector beside Customer name and support the approved choices: Naveen C-11, Rajeev SC-10, Anand SC-13, and Chander TSC-23.

Loaded customer cards were verified on desktop and mobile. They render the required format `{Salesman} Customer Name`, while preserving the customer address, mobile number, and edit/delete controls.

A populated desktop bills view was verified with a temporary isolated preview record. It rendered `{Naveen C-11} Preview Customer` alongside the shop, stitching amount, balance amount, payment state, progress reason, and bill actions. The temporary preview shop, customer, and bill were deleted after verification.

Automated verification includes the formatter/catalog unit tests, the salesman persistence and formatted-name search integration test, `pnpm check`, and the standard Vitest suite. The opt-in integration test passed against the configured Supabase database.
