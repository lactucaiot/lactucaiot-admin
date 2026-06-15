# LactucAIoT Admin Panel

Static admin website for managing registered chambers, admin accounts, and customer support tickets.

## Open

Open `C:\ninjapi\admin\index.html` in a browser.

## Login

- Super Admin: `superadmin@lactucaiot.ph` / `superadmin123`

## Data storage

This version stores the browser-side database in `localStorage` under:

`lactucaiot_admin_database_empty_v2`

It starts with empty chambers and empty support tickets. The only initial record is the Super Admin login account. For production, connect the screens to a backend database and store only hashed passwords server-side.
