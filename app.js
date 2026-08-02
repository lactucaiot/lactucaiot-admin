import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
emailjs.init("KR2hn-Hd5N3a_PKWp");

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const SESSION_KEY = "lactucaiot_session";

// Passwords are hashed with bcrypt via Postgres RPC (hash_password / check_password).
// Bcrypt hashes are one-way and cannot be decrypted or displayed — see chamberRow/adminRow.
async function hashPassword(plain) {
  const { data, error } = await supabase.rpc("hash_password", { plain });
  if (error) throw error;
  return data;
}

async function checkPasswordMatch(plain, hashed) {
  const { data, error } = await supabase.rpc("check_password", { plain, hashed });
  if (error) return false;
  return Boolean(data);
}

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

const state = {
  session: loadSession(),
  active: location.hash.replace("#", "") || "dashboard",
  drawerOpen: false,
  chamberSearch: "",
  ticketFilter: "All",
  selectedTicketId: null,
  modal: null,
  nextChamberId: null,
  nextAdminId: null,
  error: "",
  chambers: [],
  tickets: [],
  admins: [],
  replies: []
};

window.addEventListener( 'pageshow', (event) => {
  if (event.persisted) {
    if (!state.session) {
      render();
    }
  }
});  

window.addEventListener( 'popstate', () => {
  if (!state.session) {
    history.replaceState(null, "", window.location.href);
  } else {
    render();
  }
});

const pageTitles = {
  dashboard: "Dashboard",
  chambers: "Chamber Database",
  support: "Customer Support Center",
  admins: "Admin Management"
};

const navItems = [
  { key: "dashboard", icon: "ti-dashboard", label: "Dashboard" },
  { key: "chambers", icon: "ti-database", label: "Chambers" },
  { key: "support", icon: "ti-headset", label: "Customer Support" },
  { key: "admins", icon: "ti-shield-check", label: "Admin Management" }
];

function setSession(admin) {
  state.session = admin 
    ? { id: admin.id, name: admin.name, email: admin.email, role: admin.role }
    : null;

  if (admin) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state.session));
    history.replaceState(null, "", window.location.href);
  } else {
    sessionStorage.removeItem(SESSION_KEY);
    history.replaceState(null, "", window.location.href);
  }
}

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function displayDate() {
  return new Date().toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function statusColor(label) {
  return {
    Active: ["#dcfce7", "#15803d"],
    Inactive: ["#f1f5f9", "#64748b"],
    Pending: ["#fef9c3", "#a16207"],
    Open: ["#dbeafe", "#1d4ed8"],
    "In Progress": ["#fef9c3", "#a16207"],
    Resolved: ["#dcfce7", "#15803d"],
    High: ["#fee2e2", "#dc2626"],
    Medium: ["#fef9c3", "#a16207"],
    Low: ["#f0fdf4", "#15803d"],
    Admin: ["#e6f7f0", "#127a4c"],
    "Super Admin": ["#f3e8ff", "#7e22ce"]
  }[label] || ["#f1f5f9", "#64748b"];
}

function badge(label) {
  const [bg, color] = statusColor(label);
  return `<span class="badge" style="background:${bg};color:${color}">${esc(label)}</span>`;
}

function render() {
  const app = document.getElementById("app");
  if (!state.session) {
    state.session = loadSession();
  }

  if (!state.session) {
    app.innerHTML = loginView();
  } else {
    app.innerHTML = shellView();
  }
  bindEvents();
}

function loginView() {
  return `
    <main class="login-page">
      <section class="login-card" aria-labelledby="login-title">
        <div class="brand-lockup">
          <div class="brand-mark"><img src="./Logo.png" alt="LactucAIoT logo" /></div>
          <div id="login-title" class="brand-title">LactucAIoT</div>
          <div class="muted small">Admin Portal</div>
        </div>
        <form id="loginForm">
          <div class="role-switch" role="tablist" aria-label="Login role">
            <button type="button" class="active" data-login-role="Admin">Admin</button>
            <button type="button" data-login-role="Super Admin">Super Admin</button>
          </div>
          <div class="field">
            <label for="loginEmail">Email</label>
            <input id="loginEmail" type="email" autocomplete="username" placeholder="admin@lactucaiot.ph" required />
          </div>
          <div class="field">
            <label for="loginPassword">Password</label>
            <div class="password-wrap">
              <input id="loginPassword" type="password" autocomplete="current-password" placeholder="Password" required />
              <button type="button" class="icon-button" data-toggle-input-password data-target="loginPassword"><i class="ti ti-eye"></i></button>
            </div>
          </div>
          ${state.error ? `<div class="error-box">${esc(state.error)}</div>` : ""}
          <button class="primary-btn login-submit" type="submit">Sign in to Admin Panel</button>
        </form>
      </section>
    </main>
  `;
}

function shellView() {
  return `
    <div class="app-shell">
      ${sidebarView()}
      <div class="mobile-drawer-overlay${state.drawerOpen ? " open" : ""}" id="drawerOverlay"></div>
      <aside class="mobile-drawer${state.drawerOpen ? " open" : ""}" id="mobileDrawer">
        ${mobileDrawerView()}
      </aside>
      <main class="main">
        ${topbarView()}
        <section class="content">${pageView()}</section>
      </main>
      ${state.modal ? modalView() : ""}
    </div>
  `;
}

function sidebarView() {
  const availableNav = navItems.filter((item) => state.session.role === "Super Admin" || item.key !== "admins");
  return `
    <aside class="sidebar">
      <div class="sidebar-head">
        <div class="sidebar-brand">
          <div class="sidebar-mark"><img src="./Logo.png" alt="" aria-hidden="true" /></div>
          <div>
            <div class="sidebar-title">LactucAIoT</div>
            <div class="role-label">${esc(pageTitles[state.active])}</div>
          </div>
        </div>
      </div>
      <nav class="nav" aria-label="Admin navigation">
        ${availableNav.map((item) => `
          <button class="${state.active === item.key ? "active" : ""}" data-nav="${item.key}">
            <i class="ti ${item.icon}"></i><span>${item.label}</span>
          </button>
        `).join("")}
      </nav>
      <div class="sidebar-foot">
        <button class="logout-btn" data-logout><i class="ti ti-logout"></i><span>Sign out</span></button>
      </div>
    </aside>
  `;
}

function mobileDrawerView() {
  const availableNav = navItems.filter((item) => state.session.role === "Super Admin" || item.key !== "admins");
  const initials = state.session.role === "Super Admin" ? "SA" : "AD";
  return `
    <div class="mobile-drawer-inner">
      <nav class="mobile-drawer-nav" aria-label="Mobile navigation">
        ${availableNav.map((item) => `
          <button class="mobile-drawer-nav-item ${state.active === item.key ? "active" : ""}" data-nav="${item.key}" data-close-drawer>
            <i class="ti ${item.icon}"></i><span>${item.label}</span>
          </button>
        `).join("")}
      </nav>
      <div class="mobile-drawer-foot">
        <div class="mobile-drawer-user">
          <div class="avatar">${initials}</div>
          <div class="mobile-drawer-user-info">
            <div class="mobile-drawer-name">${esc(state.session.name)}</div>
            <div class="mobile-drawer-role">${esc(state.session.role)}</div>
            <div class="mobile-drawer-date">${displayDate()}</div>
          </div>
        </div>
        <button class="logout-btn mobile-drawer-logout" data-logout>
          <i class="ti ti-logout"></i><span>Sign out</span>
        </button>
      </div>
    </div>
  `;
}

function topbarView() {
  const initials = state.session.role === "Super Admin" ? "SA" : "AD";
  return `
    <header class="topbar">
      <!-- Desktop left: page title -->
      <h1 class="topbar-title-desktop">${pageTitles[state.active]}</h1>
      <!-- Desktop right: date + user chip -->
      <div class="topbar-right topbar-right-desktop">
        <span class="muted small">${displayDate()}</span>
        <div class="user-chip">
          <div class="avatar">${initials}</div>
          <div>
            <div class="strong small">${esc(state.session.name)}</div>
            <div class="muted tiny">${esc(state.session.role)}</div>
          </div>
        </div>
      </div>
      <!-- Mobile: brand block (logo + LactucAIoT + page name) -->
      <div class="mobile-topbar-brand">
        <div class="mobile-topbar-logo">
          <img src="./Logo.png" alt="LactucAIoT logo" />
        </div>
        <div class="mobile-topbar-text">
          <div class="mobile-topbar-name">LactucAIoT</div>
          <div class="mobile-topbar-page">${esc(pageTitles[state.active])}</div>
        </div>
      </div>
      <!-- Mobile: hamburger -->
      <button class="hamburger-btn" data-open-drawer aria-label="Open menu">
        <i class="ti ti-menu-2" style="pointer-events:none"></i>
      </button>
    </header>
  `;
}

function pageView() {
  if (state.active === "dashboard") return dashboardView();
  if (state.active === "chambers") return chambersView();
  if (state.active === "support") return supportView();
  if (state.active === "admins") return state.session.role === "Super Admin" ? adminsView() : restrictedView();
  return dashboardView();
}

function dashboardView() {
  const stats = [
    { label: "Total Chambers", value: state.chambers.length, icon: "ti-building-factory-2", color: "#1aaa6a" },
    { label: "Active Chambers", value: state.chambers.filter((c) => c.status === "Active").length, icon: "ti-circle-check", color: "#22c55e" },
    { label: "Open Tickets", value: state.tickets.filter((t) => t.status === "Open").length, icon: "ti-ticket", color: "#3b82f6" },
    { label: "Admins", value: state.admins.length, icon: "ti-users", color: "#a855f7" }
  ];

  return `
    <div class="stats-grid">
      ${stats.map((item) => `
        <article class="stat-card">
          <div class="stat-top">
            <div class="stat-label">${item.label}</div>
            <div class="stat-icon" style="background:${item.color}18;color:${item.color}"><i class="ti ${item.icon}"></i></div>
          </div>
          <div class="stat-value">${item.value}</div>
        </article>
      `).join("")}
    </div>
    <div class="dashboard-grid">
      <section class="panel">
        <div class="panel-head"><div class="panel-title">Recent Chambers</div></div>
        ${state.chambers.length ? state.chambers.slice(0, 5).map((c) => `
          <div class="list-row">
            <div>
              <div class="strong small">${esc(c.name)}</div>
              <div class="muted tiny">${esc(c.id)} &middot; ${esc(c.email)}</div>
            </div>
            ${badge(c.status)}
          </div>
        `).join("") : `<div class="empty-state">No chambers registered yet.</div>`}
      </section>
      <section class="panel">
        <div class="panel-head"><div class="panel-title">Recent Support Tickets</div></div>
        ${state.tickets.length ? state.tickets.slice(0, 5).map((t) => `
          <div class="list-row">
            <div>
              <div class="strong small">${esc(t.subject)}</div>
              <div class="muted tiny">${esc(t.id)} &middot; ${esc(chamberName(t))}</div>
            </div>
            <div class="row-actions">${badge(t.priority)}${badge(t.status)}</div>
          </div>
        `).join("") : `<div class="empty-state">No support tickets yet.</div>`}
      </section>
    </div>
  `;
}

function chambersView() {
  const query = state.chamberSearch.toLowerCase();
  const filtered = state.chambers.filter((c) =>
    c.status !== "Rejected" &&
    [c.id, c.name, c.email, c.status].some((value) => value.toLowerCase().includes(query))
  );

  return `
    <section class="panel">
      <div class="panel-head">
        <div>
          <div class="panel-title">Registered Chambers</div>
          <div class="panel-subtitle">Chamber IDs, owner emails, status, and registration records</div>
        </div>
        <div class="toolbar">
          <div class="search-box">
            <i class="ti ti-search"></i>
            <input id="chamberSearch" value="${esc(state.chamberSearch)}" placeholder="Search chambers..." />
          </div>
          <button class="primary-btn" data-open-modal="chamber"><i class="ti ti-plus"></i>Add Chamber</button>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Chamber ID</th><th>Chamber Name</th><th>Email</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map((c) => chamberRow(c)).join("") || `<tr><td colspan="5"><div class="empty-state">No chambers found.</div></td></tr>`}
          </tbody>
        </table>
      </div>
      <div class="footer-note">Showing ${filtered.length} of ${state.chambers.filter(c =>c.status === "Active" || c.status === "Pending").length} chambers</div>
    </section>
  `;
}

function chamberRow(c) {
  return `
   ${c.status === "Pending" || c.status === "Active" ? ` 
    <tr>
      <td><span class="mono-pill">${esc(c.id)}</span></td>
      <td><span class="strong">${esc(c.name)}</span></td>
      <td style="color:var(--teal)">${esc(c.email)}</td>
      <td>
        <div class="row-actions">
        ${c.status === "Active" ? `
          <button class="soft-btn" data-edit-chamber="${esc(c.id)}"><i class="ti ti-pencil"></i>Edit</button>
          <button class="danger-btn" data-delete-chamber="${esc(c.id)}"><i class="ti ti-trash"></i>Delete</button>
        ` : ""}
          ${c.source === "app" && c.status === "Pending" ? `
            <button class="soft-btn" data-approve-chamber="${esc(c.id)}"><i class="ti ti-check"></i>Approve</button>
            <button class="danger-btn" data-reject-chamber="${esc(c.id)}"><i class="ti ti-x"></i>Reject</button>
          ` : ""}
        </div>
      </td>
    </tr>
    ` : ""}
  `;
}

function supportView() {
  if (!state.tickets.some((t) => t.id === state.selectedTicketId)) {
    state.selectedTicketId = state.tickets[0]?.id || null;
  }
  const tickets = state.ticketFilter === "All" ? state.tickets : state.tickets.filter((t) => t.status === state.ticketFilter);
  const selected = state.tickets.find((t) => t.id === state.selectedTicketId) || tickets[0];
  if (selected && selected.id !== state.selectedTicketId) state.selectedTicketId = selected.id;

  const counts = {
    All: state.tickets.length,
    Open: state.tickets.filter((t) => t.status === "Open").length,
    "In Progress": state.tickets.filter((t) => t.status === "In Progress").length,
    Resolved: state.tickets.filter((t) => t.status === "Resolved").length
  };

  return `
    <div class="inbox-layout">
      <!-- Left: Inbox sidebar -->
      <aside class="inbox-sidebar">
        <div class="inbox-sidebar-head">
          <div class="inbox-sidebar-title">Inbox</div>
        </div>
        <div class="inbox-filters">
          ${["All", "Open", "In Progress", "Resolved"].map((filter) => `
            <button class="inbox-filter-btn ${state.ticketFilter === filter ? "active" : ""}" data-ticket-filter="${filter}">
              <span>${filter}</span>
              <span class="inbox-filter-count">${counts[filter]}</span>
            </button>
          `).join("")}
        </div>
        <div class="inbox-list">
          ${tickets.length ? tickets.map((t) => ticketInboxItem(t)).join("") : `<div class="inbox-empty"><i class="ti ti-inbox"></i><span>No tickets here.</span></div>`}
        </div>
      </aside>

      <!-- Right: Ticket detail -->
      ${selected ? ticketDetailView(selected) : `
        <div class="inbox-blank">
          <i class="ti ti-mail-opened" style="font-size:48px;color:var(--border)"></i>
          <div style="color:var(--muted);margin-top:12px;font-size:14px">Select a ticket to read it</div>
        </div>
      `}
    </div>
  `;
}

// Resolve a ticket's chamber to a human name. App-created tickets store
// only chamber_id, so look the name up from the loaded chambers list;
// fall back through any stored name, the id, then "Unknown".
function chamberName(t) {
  const c = state.chambers.find((x) => x.id === t.chamber_id);
  return c?.name || t.chamber || t.chamber_id || "Unknown";
}

function ticketInboxItem(t) {
  const isActive = state.selectedTicketId === t.id;
  const unread = t.status === "Open";
  const replies = state.replies.filter((r) => r.ticket_id === t.id);
  const lastReply = replies[replies.length - 1];
  const [statusBg, statusColor] = statusColor2(t.status);
  return `
    <button class="inbox-item ${isActive ? "inbox-item--active" : ""}" data-select-ticket="${esc(t.id)}">
      <div class="inbox-item-top">
        <span class="inbox-item-from ${unread ? "inbox-item-from--unread" : ""}">${esc(chamberName(t))}</span>
        <span class="inbox-item-date">${esc(t.date || t.created_at?.slice(0,10) || "")}</span>
      </div>
      <div class="inbox-item-subject ${unread ? "inbox-item-subject--unread" : ""}">${esc(t.subject)}</div>
      <div class="inbox-item-preview">${lastReply ? esc(lastReply.message.slice(0, 72)) + (lastReply.message.length > 72 ? "…" : "") : esc(t.description?.slice(0, 72) || "No messages yet")}</div>
      <div class="inbox-item-meta">
        <span class="inbox-status-dot" style="background:${statusColor}">${esc(t.status)}</span>
        ${t.category ? `<span class="inbox-category">${esc(t.category)}</span>` : ""}
      </div>
    </button>
  `;
}

function ticketDetailView(ticket) {
  const resolved = ticket.status === "Resolved";
  const chName = chamberName(ticket);

  const replies = state.replies.filter((r) => r.ticket_id === ticket.id);

  return `
    <div class="ticket-detail">
      <!-- Detail header — unchanged -->
      <div class="ticket-detail-head">
        <div class="ticket-detail-subject">${esc(ticket.subject)}</div>
        <div class="ticket-detail-meta-row">
          <span class="mono-pill">${esc(ticket.id)}</span>
          <span class="ticket-detail-sep">·</span>
          <span style="color:var(--text-2)">${esc(chName)}</span>
          ${ticket.category ? `<span class="ticket-detail-sep">·</span><span style="color:var(--text-2)">${esc(ticket.category)}</span>` : ""}
          <span class="ticket-detail-sep">·</span>
          <span style="color:var(--muted);font-size:12px">${esc(ticket.created_at?.slice(0, 10) || "")}</span>
        </div>
        <div class="ticket-detail-actions">
          ${ticket.priority ? badge(ticket.priority) : ""}
          <div class="status-switcher">
            <span class="status-switcher-label">Status:</span>
            <button class="status-btn ${ticket.status === "Open" ? "status-btn--active status-btn--open" : ""}" data-set-status="${esc(ticket.id)}:Open" ${ticket.status === "Open" ? "disabled" : ""}><i class="ti ti-circle-dot"></i>Open</button>
            <button class="status-btn ${ticket.status === "In Progress" ? "status-btn--active status-btn--inprogress" : ""}" data-set-status="${esc(ticket.id)}:In Progress" ${ticket.status === "In Progress" ? "disabled" : ""}><i class="ti ti-clock"></i>In Progress</button>
            <button class="status-btn ${ticket.status === "Resolved" ? "status-btn--active status-btn--resolved" : ""}" data-set-status="${esc(ticket.id)}:Resolved" ${ticket.status === "Resolved" ? "disabled" : ""}><i class="ti ti-circle-check"></i>Resolved</button>
          </div>
          <button class="status-btn" data-delete-ticket="${esc(ticket.id)}" style="color:#dc2626;margin-left:8px"><i class="ti ti-trash"></i>Delete</button>
        </div>
      </div>

      <!-- Original message block — now uses ticket.description and ticket.created_at -->
      <div class="ticket-thread">
        <div class="thread-entry thread-entry--original">
          <div class="thread-entry-avatar">${esc((chName || "?")[0].toUpperCase())}</div>
          <div class="thread-entry-body">
            <div class="thread-entry-header">
              <span class="thread-entry-name">${esc(chName)}</span>
              <span class="thread-entry-time">${ticket.created_at ? new Date(ticket.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</span>
            </div>
            <div class="thread-entry-text">${esc(ticket.description || "No description provided.")}</div>
          </div>
        </div>

        <!-- Replies — now sourced from state.replies with correct field names -->
        ${replies.map((msg) => `
          <div class="thread-entry ${msg.sender === "admin" ? "thread-entry--admin" : ""}">
            <div class="thread-entry-avatar ${msg.sender === "admin" ? "thread-entry-avatar--admin" : ""}">
              ${msg.sender === "admin" ? "A" : esc((chName || "?")[0].toUpperCase())}
            </div>
            <div class="thread-entry-body">
              <div class="thread-entry-header">
                <span class="thread-entry-name">${esc(msg.sender_name || (msg.sender === "admin" ? state.session.name : chName || "User"))}</span>
                <span class="thread-entry-time">${msg.sent_at ? new Date(msg.sent_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</span>
              </div>
              <div class="thread-entry-text">${esc(msg.message)}</div>
            </div>
          </div>
        `).join("")}
      </div>

      <!-- Reply composer — unchanged -->
      <div class="reply-composer">
        <form data-reply-form="${esc(ticket.id)}">
          <div class="reply-composer-inner">
            <div class="thread-entry-avatar thread-entry-avatar--admin" style="flex-shrink:0;margin-top:2px">A</div>
            <div style="flex:1;min-width:0">
              <textarea class="reply-composer-textarea" name="reply" placeholder="Write your reply…" rows="3"></textarea>
              <div class="reply-composer-foot">
                <span class="muted tiny">Replying as ${esc(state.session.name)}</span>
                <button class="primary-btn" type="submit"><i class="ti ti-send"></i>Send Reply</button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  `;
}

function adminsView() {
  return `
    <section class="panel">
      <div class="panel-head">
        <div>
          <div class="panel-title">Admin Management</div>
          <div class="panel-subtitle">Super Admin can create, edit, activate, disable, and remove admin accounts</div>
        </div>
        <button class="primary-btn" data-open-modal="admin"><i class="ti ti-plus"></i>Add Admin</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th><th>Actions</th></tr>
          </thead>
          <tbody>
            ${state.admins.map((a) => adminRow(a)).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function adminRow(a) {
  const initials = a.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const canDelete = a.id !== state.session.id && a.role !== "Super Admin";
  return `
    <tr>
      <td><span class="mono-pill">${esc(a.id)}</span></td>
      <td>
        <div class="row-actions">
          <span class="avatar">${esc(initials)}</span>
          <span class="strong">${esc(a.name)}</span>
        </div>
      </td>
      <td style="color:var(--teal)">${esc(a.email)}</td>
      <td>${badge(a.role)}</td>
      <td>
        <div class="row-actions">
          <button class="soft-btn" data-edit-admin="${esc(a.id)}"><i class="ti ti-pencil"></i>Edit</button>
          ${canDelete ? `<button class="danger-btn" data-delete-admin="${esc(a.id)}"><i class="ti ti-trash"></i>Remove</button>` : ""}
        </div>
      </td>
    </tr>
  `;
}

function restrictedView() {
  return `
    <section class="panel restricted">
      <i class="ti ti-lock" style="font-size:42px"></i>
      <div class="panel-title" style="margin-top:10px">Access Restricted</div>
      <p>Only Super Admin accounts can manage admin users.</p>
    </section>
  `;
}

function modalView() {
  if (state.modal.type === "chamber") return chamberModal();
  if (state.modal.type === "admin") return adminModal();
  if (state.modal.type === "ticket") return ticketModal();
  if (state.modal.type === "confirm") return confirmModal();
  return "";
}

// A confirm dialog in the portal's own styling, replacing window.confirm().
//
// The native dialog cannot be styled, announces the origin
// ("lactucaiot.netlify.app says"), and looks like a browser warning rather
// than part of the product — which is exactly the wrong tone for a
// destructive action the operator is meant to read carefully.
//
// Driven through state.modal like every other dialog here, so it renders,
// closes and rebinds with the same machinery.
function confirmModal() {
  const { title, body, confirmLabel, danger } = state.modal;
  return `
    <div class="modal-backdrop">
      <div class="modal" style="max-width:460px">
        <div class="modal-head">
          <div class="panel-title">${esc(title || "Are you sure?")}</div>
          <button type="button" class="icon-button" data-close-modal aria-label="Close"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body">
          <p style="margin:0;font-size:13px;line-height:1.6;white-space:pre-line">${esc(body || "")}</p>
        </div>
        <div class="modal-foot">
          <button type="button" class="secondary-btn" data-close-modal>Cancel</button>
          <button type="button" class="${danger ? "danger-btn" : "primary-btn"}" data-confirm-ok>
            ${esc(confirmLabel || "Confirm")}
          </button>
        </div>
      </div>
    </div>
  `;
}

// Opens the confirm modal and runs `onConfirm` if the operator agrees.
// The callback is held outside state so it never lands in sessionStorage.
let pendingConfirm = null;
function askConfirm({ title, body, confirmLabel, danger = true, onConfirm }) {
  pendingConfirm = onConfirm;
  state.modal = { type: "confirm", title, body, confirmLabel, danger };
  render();
}

function chamberModal() {
  const item = state.modal.id ? state.chambers.find((c) => c.id === state.modal.id) : null;
  return `
    <div class="modal-backdrop">
      <form class="modal" id="chamberForm">
        <div class="modal-head">
          <div class="panel-title">${item ? "Edit Chamber" : "Add Chamber"}</div>
          <button type="button" class="icon-button" data-close-modal aria-label="Close"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body form-grid">
          <div class="field"><label>Chamber ID</label><input name="id" value="${esc(item?.id || state.nextChamberId || "")}" readonly required /></div>
          <div class="field span-2"><label>Chamber Name</label><input name="name" value="${esc(item?.name || "")}" required /></div>
          <div class="field-stack">
            <div class="field"><label>Email</label><input name="email" type="email" value="${esc(item?.email || "")}" required /></div>
            <div class="field">
              <label for="chamberPassword">Password</label>
              <div class="password-wrap">
                <input id="chamberPassword" name="password" type="password" ${item ? "" : "required"} />
                <button type="button" class="icon-button" data-toggle-input-password data-target="chamberPassword"><i class="ti ti-eye"></i></button>
              </div>
              ${item ? `<small class="field-hint">Leave blank to keep current password.</small>` : ""}
            </div>
          </div>
          <div class="password-strength" id="chamberPasswordStrength">
            <ul class="password-checklist">
              <li class="chamberCheck-length"><i class="ti ti-x"></i>At least 8 characters</li>
              <li class="chamberCheck-uppercase"><i class="ti ti-x"></i>Contains uppercase letter</li>
              <li class="chamberCheck-lowercase"><i class="ti ti-x"></i>Contains lowercase letter</li>
              <li class="chamberCheck-number"><i class="ti ti-x"></i>Contains number</li>
              <li class="chamberCheck-symbol"><i class="ti ti-x"></i>Contains symbol</li>
            </ul>
            <div class="strength-bar">
              <div class="strength-fill" id="chamberStrengthFill"></div>
            </div>
            <span class="strength-label" id="chamberStrengthLabel"></span>
          </div>
          <div class="field span-2">
            <label>Device URL (Cloudflare Tunnel)</label>
            <input name="device_url" type="url" placeholder="https://api.lactucaiot.app" value="${esc(item?.device_url || "")}" />
            <small class="field-hint">The RPi4's public tunnel address — used by the app to send Control commands.</small>
          </div>
          <!-- C-3: the key is no longer a form field. The api_key column
               is not SELECT-able or UPDATE-able by the anon role (C-2),
               so rendering it here produced a blank box and saving it
               silently did nothing. It now goes through the
               admin_get/set_chamber_api_key functions, which check
               is_admin() server-side - so this works for a signed-in
               admin and for nobody else, and stays correct when growers
               become authenticated in Stage 2. -->
          <div class="field span-2">
            <label>API Key</label>
            <div class="password-wrap">
              <input id="chamberApiKey" type="text" value="" readonly
                     placeholder="Hidden — use Reveal or Rotate" />
              <button type="button" class="icon-button" data-reveal-api-key
                      data-chamber="${esc(item?.id || "")}"
                      aria-label="Reveal API key"><i class="ti ti-eye"></i></button>
              <button type="button" class="icon-button" data-rotate-api-key
                      data-chamber="${esc(item?.id || "")}"
                      aria-label="Rotate API key"><i class="ti ti-refresh"></i></button>
            </div>
            <small class="field-hint">Sent by the RPi4 as X-API-Key. After rotating, set <code>Environment=API_KEY=…</code> on the Pi and restart the service, or the chamber will stop responding.</small>
          </div>
        </div>
        <div class="modal-foot">
          <button type="button" class="secondary-btn" data-close-modal>Cancel</button>
          <button class="primary-btn" type="submit">Save Chamber</button>
        </div>
      </form>
    </div>
  `;
}

function adminModal() {
  const item = state.modal.id ? state.admins.find((a) => a.id === state.modal.id) : null;
  return `
    <div class="modal-backdrop">
      <form class="modal" id="adminForm">
        <div class="modal-head">
          <div class="panel-title">${item ? "Edit Admin" : "Add Admin"}</div>
          <button type="button" class="icon-button" data-close-modal aria-label="Close"><i class="ti ti-x"></i></button>
        </div>
        <div class="modal-body form-grid">
          <div class="field"><label>Admin ID</label><input name="id" value="${esc(item?.id ||  state.nextAdminId || "")}" readonly required /></div>
          <div class="field"><label>Role</label><select name="role">${options(["Admin", "Super Admin"], item?.role || "Admin")}</select></div>
          <div class="field span-2"><label>Name</label><input name="name" value="${esc(item?.name || "")}" required /></div>
          <div class="field-stack">
            <div class="field">
              <label>Email</label>
              <input name="email" type="email" value="${esc(item?.email || "")}" ${item ? "readonly" : ""} required />
              ${item ? `<small class="field-hint">Sign-in is handled by Supabase Auth. Change the email under Authentication &rarr; Users, then update it here to match.</small>` : ""}
            </div>
            <div class="field">
              <label for="adminPassword">Password</label>
              <div class="password-wrap">
                <input id="adminPassword" name="password" type="password" ${item ? "" : "required"} />
                <button type="button" class="icon-button" data-toggle-input-password data-target="adminPassword"><i class="ti ti-eye"></i></button>
              </div>
              ${item ? `<small class="field-hint">Leave blank to keep the current password. You can only change your own &mdash; reset others under Authentication &rarr; Users.</small>` : ""}
            </div>
          </div>
          <div class="password-strength" id="adminPasswordStrength">
            <ul class="password-checklist">
              <li class="adminCheck-length"><i class="ti ti-x"></i>At least 8 characters</li>
              <li class="adminCheck-uppercase"><i class="ti ti-x"></i>Contains uppercase letter</li>
              <li class="adminCheck-lowercase"><i class="ti ti-x"></i>Contains lowercase letter</li>
              <li class="adminCheck-number"><i class="ti ti-x"></i>Contains number</li>
              <li class="adminCheck-symbol"><i class="ti ti-x"></i>Contains symbol</li>
            </ul>
            <div class="strength-bar">
              <div class="strength-fill" id="adminStrengthFill"></div>
            </div>
            <span class="strength-label" id="adminStrengthLabel"></span>
          </div>
        </div>
        <div class="modal-foot">
          <button type="button" class="secondary-btn" data-close-modal>Cancel</button>
          <button class="primary-btn" type="submit">Save Admin</button>
        </div>
      </form>
    </div>
  `;
}

function statusColor2(label) {
  return statusColor(label);
}

function options(values, selected) {
  return values.map((value) => `<option value="${esc(value)}" ${value === selected ? "selected" : ""}>${esc(value)}</option>`).join("");
}

function bindEvents() {
  document.querySelectorAll("[data-login-role]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-login-role]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
    });
  });

  document.querySelector("#loginForm")?.addEventListener("submit", handleLogin);
  
  document.querySelectorAll("[data-toggle-input-password]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.target);
      input.type = input.type === "password" ? "text" : "password";
    });
  });

  // C-3: reveal / rotate the API key through admin-only RPCs.
  //
  // The old handler just generated a UUID into the form field and let
  // handleChamberSave write it. That path is gone: `api_key` is neither
  // readable nor writable by the anon role, so the write silently did
  // nothing. These call SECURITY DEFINER functions that verify
  // is_admin() inside the database.
  document.querySelectorAll("[data-reveal-api-key]").forEach((button) => {
    button.addEventListener("click", async () => {
      const chamberId = button.dataset.chamber;
      if (!chamberId) return;
      const { data, error } = await supabase.rpc(
        "admin_get_chamber_api_key", { p_chamber_id: chamberId });
      if (error) {
        alert("Could not read the API key: " + error.message);
        return;
      }
      document.getElementById("chamberApiKey").value = data || "(not set)";
    });
  });

  document.querySelectorAll("[data-rotate-api-key]").forEach((button) => {
    button.addEventListener("click", async () => {
      const chamberId = button.dataset.chamber;
      if (!chamberId) {
        alert("Save the chamber first, then rotate its key.");
        return;
      }
      // Rotating breaks the chamber until the Pi is updated to match, so
      // it is worth one deliberate confirmation rather than a stray click
      // on an icon.
      if (!confirm(
        `Rotate the API key for ${chamberId}?\n\n` +
        `The chamber will stop responding until you set the new key in ` +
        `its systemd file (Environment=API_KEY=…) and restart the ` +
        `service.`)) return;

      const newKey = crypto.randomUUID().replace(/-/g, "");
      const { data, error } = await supabase.rpc(
        "admin_set_chamber_api_key",
        { p_chamber_id: chamberId, p_new_key: newKey });
      if (error) {
        alert("Could not rotate the API key: " + error.message);
        return;
      }
      document.getElementById("chamberApiKey").value = data || newKey;
      alert(
        "New API key:\n\n" + (data || newKey) +
        "\n\nCopy it to the Pi now — this is the only time it is shown " +
        "without reopening this dialog.");
    });
  });

  document.querySelectorAll("[data-nav]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.active = button.dataset.nav;
      state.drawerOpen = false;
      location.hash = button.dataset.nav;
      await loadData();
    });
  });

  document.querySelectorAll("[data-logout]").forEach((button) => {
    button.addEventListener("click", async () => {
      // C-3: clear the real token as well as the UI session. Without
      // this, signing out would leave a valid JWT in local storage and
      // the next page load would silently still be authenticated.
      await supabase.auth.signOut();
      setSession(null);
      state.active = "dashboard";
      state.drawerOpen = false;
      location.hash = "";
      render();
    });
  });


  document.querySelector("#chamberSearch")?.addEventListener("input", (event) => {
    state.chamberSearch = event.target.value;
    render();
    const search = document.querySelector("#chamberSearch");
    search?.focus();
    search?.setSelectionRange(state.chamberSearch.length, state.chamberSearch.length);
  });

  document.querySelectorAll("[data-open-modal]").forEach((button) => {
    button.addEventListener("click", async () => {
      const modalType = button.dataset.openModal;
      state.modal = { type: modalType };

      if (modalType === "chamber") {
        state.nextChamberId = await resolveNextId("chamber");
      }
      else if (modalType === "admin") {
        state.nextAdminId = await resolveNextId("admin");
      }
      render();
    });
  });

  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => {
      pendingConfirm = null;
      state.modal = null;
      render();
    });
  });

  document.querySelectorAll("[data-confirm-ok]").forEach((button) => {
    button.addEventListener("click", async () => {
      const run = pendingConfirm;
      pendingConfirm = null;
      state.modal = null;
      render();
      if (run) await run();
    });
  });

  const chamberPwd = document.querySelector("#chamberPassword");
  if (chamberPwd) {
    chamberPwd.addEventListener("input", () => checkPassword(chamberPwd.value, "chamber"));
  }

  const adminPwd = document.querySelector("#adminPassword");
  if (adminPwd) {
    adminPwd.addEventListener("input", () => checkPassword(adminPwd.value, "admin"));
  }
  
  document.querySelectorAll("[data-approve-chamber]").forEach((button) => {
    button.addEventListener("click", () => approveChamber(button.dataset.approveChamber));
  });

  document.querySelectorAll("[data-reject-chamber]").forEach((button) => {
    button.addEventListener("click", () => rejectChamber(button.dataset.rejectChamber));
  });

  document.querySelectorAll("[data-edit-chamber]").forEach((button) => {
    button.addEventListener("click", () => {
      state.modal = { type: "chamber", id: button.dataset.editChamber };
      render();
    });
  });

  document.querySelectorAll("[data-delete-chamber]").forEach((button) => {
    button.addEventListener("click", () => deleteChamber(button.dataset.deleteChamber));
  });

  document.querySelectorAll("[data-edit-admin]").forEach((button) => {
    button.addEventListener("click", () => {
      state.modal = { type: "admin", id: button.dataset.editAdmin };
      render();
    });
  });

  document.querySelectorAll("[data-delete-admin]").forEach((button) => {
    button.addEventListener("click", () => deleteAdmin(button.dataset.deleteAdmin));
  });

  document.querySelectorAll("[data-ticket-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.ticketFilter = button.dataset.ticketFilter;
      render();
    });
  });

  document.querySelectorAll("[data-select-ticket]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedTicketId = button.dataset.selectTicket;
      render();
    });
  });

  document.querySelectorAll("[data-resolve-ticket]").forEach((button) => {
    button.addEventListener("click", () => updateTicketStatus(button.dataset.resolveTicket, "Resolved"));
  });

  document.querySelectorAll("[data-set-inprogress]").forEach((button) => {
    button.addEventListener("click", () => updateTicketStatus(button.dataset.setInprogress, "In Progress"));
  });

  document.querySelectorAll("[data-set-status]").forEach((button) => {
    button.addEventListener("click", () => {
      const [id, ...rest] = button.dataset.setStatus.split(":");
      updateTicketStatus(id, rest.join(":"));
    });
  });

  document.querySelectorAll("[data-delete-ticket]").forEach((button) => {
    button.addEventListener("click", () => deleteTicket(button.dataset.deleteTicket));
  });

  document.querySelector("[data-reply-form]")?.addEventListener("submit", handleReply);
  document.querySelector("#chamberForm")?.addEventListener("submit", handleChamberSave);
  document.querySelector("#adminForm")?.addEventListener("submit", handleAdminSave);
}

// C-3 Stage 1 — login now goes through Supabase Auth.
//
// WHAT THIS REPLACES, AND WHY IT MATTERED
// The previous version did `.from("admins").select("*")` with the ANON key
// and compared the password in the browser. Two consequences:
//
//   1. Every admin's bcrypt hash was handed to any caller holding the anon
//      key — which ships in the portal's config.js and in the Flutter app,
//      so it is public. Offline cracking was a copy-paste away.
//   2. There was no server-side session. `state.session` came from
//      sessionStorage, so setting that value by hand produced a working
//      portal. Authentication was decorative.
//
// signInWithPassword() returns a real JWT that supabase-js attaches to every
// subsequent request. Combined with the `is_admin()` policies, a forged
// sessionStorage entry now yields a UI shell and nothing else: the database
// refuses each query behind it.
//
// The admins row is still read afterwards, but only for display (name,
// role). Identity comes from the token, not from that row.
async function handleLogin(event) {
  event.preventDefault();
  const role = document.querySelector("[data-login-role].active").dataset.loginRole;
  const email = document.querySelector("#loginEmail").value.trim().toLowerCase();
  const password = document.querySelector("#loginPassword").value;

  const { data: auth, error: authError } =
    await supabase.auth.signInWithPassword({ email, password });

  if (authError || !auth?.user) {
    state.error = "Invalid email or password.";
    render();
    return;
  }

  const { data, error } = await supabase
    .from("admins")
    .select("*")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle();

  // Signed in to Supabase but with no admins row — an auth user that was
  // never linked. Sign back out so we never hold a token that implies
  // access the policies will refuse anyway.
  if (error || !data) {
    await supabase.auth.signOut();
    state.error = "This account is not registered as an administrator.";
    render();
    return;
  }

  if (data.role !== role) {
    await supabase.auth.signOut();
    state.error = "Invalid email, password, or selected role.";
    render();
    return;
  }

  if (data.status !== "Active") {
    await supabase.auth.signOut();
    state.error = "This admin account is not active.";
    render();
    return;
  }

  await supabase.from("admins").update({ last_login: new Date().toISOString() }).eq("id", data.id);

  state.error = "";
  setSession(data);
  render();

}

function formObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

// Highest numeric suffix across a set of IDs, or 0 for none.
function highestIdNumber(ids) {
  return (ids || [])
    .map((id) => String(id || "").match(/(\d+)\s*$/))
    .filter(Boolean)
    .map((m) => parseInt(m[1], 10))
    .filter((n) => !Number.isNaN(n))
    .reduce((max, n) => (n > max ? n : max), 0);
}

// Local fallback from whatever the page already holds.
//
// FIXED: this used to `return` inside the loop, so it incremented the
// FIRST id it happened to see rather than the highest. With ADM-001 and
// ADM-006 present it would offer ADM-002 — an ID that may well be free
// today and collide tomorrow.
function getNextIdFor(kind) {
  const existing = kind === "chamber" ? state.chambers : state.admins;
  const prefix = kind === "chamber" ? "LC-AIOT-" : "ADM-";
  const ids = (existing || []).map((item) => String(item?.id || "")).filter(Boolean);
  const next = highestIdNumber(ids) + 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

// Authoritative next ID: ask the table itself.
//
// WHY NOT THE RPC ALONE. resolveNextId used to trust peek_next_*_id
// outright. "Peek" is non-consuming, and rows are inserted with an
// explicit id rather than drawing from that sequence — so nothing ever
// advances it. It returned ADM-006, the row was created, and the next
// call returned ADM-006 again: a duplicate primary key, surfacing as the
// 409 on save.
//
// The table is the only source that cannot drift. The RPC is still
// consulted first (it may encode a numbering convention this code does
// not know), but its answer is REJECTED if that id already exists.
async function resolveNextId(kind) {
  const table = kind === "chamber" ? "chambers" : "admins";
  const prefix = kind === "chamber" ? "LC-AIOT-" : "ADM-";
  const rpcName = kind === "chamber" ? "peek_next_chamber_id" : "peek_next_admin_id";

  let taken = [];
  try {
    const { data, error } = await supabase.from(table).select("id");
    if (!error && Array.isArray(data)) taken = data.map((r) => String(r.id));
  } catch (error) {
    console.warn(`Could not read ${table} for ID allocation.`, error);
  }

  try {
    const { data, error } = await supabase.rpc(rpcName);
    if (!error && data && !taken.includes(String(data))) return data;
    if (data) {
      console.warn(
        `${rpcName} returned ${data}, which already exists — ` +
        `falling back to max+1.`);
    }
  } catch (error) {
    console.warn(`RPC ${rpcName} unavailable, using max+1.`, error);
  }

  if (taken.length) {
    return `${prefix}${String(highestIdNumber(taken) + 1).padStart(3, "0")}`;
  }
  return getNextIdFor(kind);
}

function checkPassword(value, prefix) {
  const check = {
    length: value.length >= 8,
    uppercase: /[A-Z]/.test(value),
    lowercase: /[a-z]/.test(value),
    number: /[0-9]/.test(value),
    symbol: /[^A-Za-z0-9]/.test(value)
  };

  Object.keys(check).forEach((key) => {
    const li = document.querySelector(`.${prefix}Check-${key}`);
    if (!li) return;

    const icon = li.querySelector("i");

    if (check[key]) {
      icon.className = "ti ti-check";
      li.style.color = "green";
    } else {
      icon.className = "ti ti-x";
      li.style.color = "";
    }
  });

  let score = 0;

  if (value.length === 0) {
    score = 0;
  } else if (value.length < 8) {
    score = 1;
  } else {
    score = 1;

    if (check.uppercase) score++;
    if (check.lowercase) score++;
    if (check.number) score++;
    if (check.symbol) score++;
  }

  const levels = ["", "Weak", "Fair", "Good", "Strong", "Very Strong"];
  const colors = ["", "#e74c3c", "#e67e22", "#f1c40f", "#2ecc71", "#27ae60"];

  const fill = document.getElementById(`${prefix}StrengthFill`);
  const label = document.getElementById(`${prefix}StrengthLabel`);

  if (fill) {
    fill.style.width = `${(score / 5) * 100}%`;
    fill.style.backgroundColor = colors[score];
  }

  if (label) {
    label.textContent = levels[score];
    label.style.color = colors[score];
  }

  return score;
}

async function handleChamberSave(event) {
  event.preventDefault();
  const data = formObject(event.target);
  const isEditing = Boolean(state.modal?.id);

  if (!isEditing && !data.password) {
    alert("Password is required.");
    return;
  }

  if (data.password && data.password.length < 8) {
    alert("Password must be at least 8 characters.");
    return;
  }

  const existing = isEditing ? state.chambers.find((c) => c.id === state.modal.id) : null;

  try {
    if (isEditing) {
      // C-3: `api_key` deliberately absent. The anon role cannot write
      // that column, so including it made the whole UPDATE fail — the
      // key is managed by the Rotate action instead.
      const updatePayload = {
        name: data.name.trim(),
        email: data.email.trim(),
        device_url: data.device_url ? data.device_url.trim() : null,
      };

      if (data.password) {
        updatePayload.password = await hashPassword(data.password);
      }
      if (existing?.status) {
        updatePayload.status = existing.status;
      }

      const { error } = await supabase.from("chambers").update(updatePayload).eq("id", data.id);
      if (error) throw error;
    } else {
      // Re-derive rather than trusting state.nextChamberId, which is
      // computed when the dialog opens and goes stale — the same defect
      // that produced duplicate ADM ids on the admin side.
      const id = await resolveNextId("chamber");
      const { error } = await supabase.from("chambers").insert({
        id,
        name: data.name.trim(),
        email: data.email.trim(),
        password: await hashPassword(data.password),
        status: "Active",
        registered: new Date().toISOString().slice(0, 10),
        source: "admin",
        device_url: data.device_url ? data.device_url.trim() : null,
        // api_key omitted — the column default gen_random_uuid() fills
        // it, and Rotate changes it later. See C-3.
      });
      if (error) throw error;
    }

    state.modal = null;
    await loadData();
  } catch (error) {
    console.error("Failed to save chamber:", error);
    alert("Unable to save chamber. Check the browser console for details.");
  }
}

async function handleAdminSave(event) {
  event.preventDefault();
  const data = formObject(event.target);
  const isEditing = Boolean(state.modal?.id);

  if (!isEditing && !data.password) {
    alert("Password is required.");
    return;
  }

  if (data.password && data.password.length < 8) {
    alert("Password must be at least 8 characters.");
    return;
  }

  const existing = isEditing ? state.admins.find((a) => a.id === state.modal.id) : null;

  try {
    if (isEditing) {
      // C-3: EMAIL AND PASSWORD NOW LIVE IN SUPABASE AUTH, not here.
      //
      // Writing them to this table would appear to succeed and change
      // nothing about signing in — the worst kind of failure, because
      // an admin would be locked out believing their password had been
      // updated. Both are therefore handled explicitly.
      const updatePayload = {
        name: data.name.trim(),
        role: data.role,
      };
      if (existing?.status) {
        updatePayload.status = existing.status;
      }

      const newEmail = data.email.trim().toLowerCase();
      if (existing && newEmail && newEmail !== String(existing.email).toLowerCase()) {
        alert(
          "Email cannot be changed here.\n\n" +
          "Sign-in is handled by Supabase Auth, so changing it in this " +
          "table alone would leave the admin unable to log in. Change it " +
          "under Authentication → Users, then edit it here to match.");
        return;
      }

      if (data.password) {
        const { data: sessionData } = await supabase.auth.getUser();
        const isSelf = sessionData?.user?.id && existing?.auth_user_id &&
                       sessionData.user.id === existing.auth_user_id;

        if (isSelf) {
          // You can change your OWN password from the browser.
          const { error: pwErr } =
            await supabase.auth.updateUser({ password: data.password });
          if (pwErr) throw pwErr;
          // Mirror it for one release so a rollback stays possible.
          updatePayload.password = await hashPassword(data.password);
        } else {
          // Changing someone ELSE's password needs the service key,
          // which must never reach a browser.
          alert(
            "You can only change your own password here.\n\n" +
            "To reset another admin's password, use Supabase → " +
            "Authentication → Users → (select the user) → Reset password.");
          return;
        }
      }

      const { error } = await supabase.from("admins").update(updatePayload).eq("id", data.id);
      if (error) throw error;
    } else {
      // Always re-derive the ID rather than trusting state.nextAdminId,
      // which is computed when the dialog opens and goes stale if the
      // admin list was empty or unreadable at that moment — handing back
      // an ID that already exists and 409-ing on the primary key.
      const id = await resolveNextId("admin");
      const email = data.email.trim().toLowerCase();

      // Pre-flight: catch a duplicate email BEFORE writing anything.
      //
      // Without this the insert fails on admins_email_key (23505) and
      // the operator gets a raw Postgres constraint name. Worse, the
      // sequence is now insert → signUp → link, so a failure part-way
      // leaves debris to clean up. Cheaper to refuse at the door.
      const { data: clash } = await supabase
        .from("admins").select("id,email").eq("email", email).maybeSingle();
      if (clash) {
        alert(
          `An admin with the email ${email} already exists ` +
          `(${clash.id}).\n\nUse a different address, or edit that ` +
          `admin instead.`);
        return;
      }

      // C-3 Stage 1 — every admin created from here on gets a Supabase
      // Auth identity, so no later migration is ever needed.
      //
      // ORDER MATTERS. The first version created the Auth user first,
      // and when the admins insert failed it left an ORPHANED Auth user:
      // invisible in this portal, and blocking any retry with that email
      // because sign-up then reports the address as taken.
      //
      // Inserting the row first inverts the failure: a half-finished
      // admin is a row with a null auth_user_id — visible here, unable
      // to sign in (is_admin() requires the link), and easy to delete.
      // The failure you can see is always the better one.
      const { error: insertErr } = await supabase.from("admins").insert({
        id,
        name: data.name.trim(),
        email,
        // Kept for one release so a rollback is possible. Supabase Auth
        // owns passwords now; this column is no longer consulted at
        // login and should be dropped once you are confident.
        password: await hashPassword(data.password),
        role: data.role,
        status: "Active",
      });
      if (insertErr) throw insertErr;

      // WHY A SECOND CLIENT: supabase.auth.signUp() replaces the CURRENT
      // session with the newly created user's — so creating an admin
      // would silently sign you out and log you in as the person you
      // just made. A client with persistSession:false creates the
      // account without touching your own token.
      const signupClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: created, error: signUpErr } =
        await signupClient.auth.signUp({ email, password: data.password });

      if (signUpErr || !created?.user) {
        // Roll the row back so a retry starts clean.
        await supabase.from("admins").delete().eq("id", id);
        throw new Error(
          (signUpErr?.message ||
            "Sign-up returned no user. If email confirmation is switched " +
            "on in Supabase, turn it off — these accounts use addresses " +
            "that do not receive mail.") +
          "\n\nThe draft admin row was removed, so you can try again.");
      }

      const { error } = await supabase.from("admins")
        .update({ auth_user_id: created.user.id }).eq("id", id);
      if (error) {
        // The link failed — most often because that Auth user is already
        // attached to a different admins row (auth_user_id is unique).
        // Remove the row we just made so nothing half-formed survives.
        await supabase.from("admins").delete().eq("id", id);
        throw new Error(
          `${error.message}\n\nCould not link the Auth account, so the ` +
          `draft admin row was removed. If an Auth user already exists ` +
          `for ${email}, delete it under Authentication → Users and try ` +
          `again.`);
      }
    }

    state.modal = null;
    await loadData();
  } catch (error) {
    // C-3: say WHICH constraint failed. "Check the console" hides a
    // message the database already worded precisely, and a 409 here has
    // several distinct causes that need different fixes.
    console.error("Failed to save admin:", error);
    const detail = [error?.message, error?.details, error?.hint, error?.code]
      .filter(Boolean).join(" · ");

    let guidance = "";
    if (error?.code === "23505" || `${error?.message}`.includes("duplicate")) {
      guidance =
        "\n\nA unique column already has this value. Usually one of:" +
        "\n • that email already exists in the admins table" +
        "\n • that Admin ID is already taken" +
        "\n • that auth user is already linked to another admin row" +
        "\n\nIf a previous attempt half-succeeded, an orphaned Auth user " +
        "may exist for this email — delete it under Authentication → " +
        "Users before retrying.";
    }
    alert("Unable to save admin.\n\n" + (detail || error) + guidance);
  }
}

async function handleTicketSave(event) {
  event.preventDefault();
  const data = formObject(event.target);
  const chamber = state.chambers.find((c) => c.id === data.chamberId);
  const { data: idRow } = await supabase.rpc("next_ticket_id");

  await supabase.from("tickets").insert({
    id: idRow,
    chamber_id: data.chamberId,
    subject: data.subject.trim(),
    category: data.category,
    priority: data.priority,
    status: "Open",
    description: data.description.trim(),
    created_at: new Date().toISOString()
  });
  
  state.modal = null;
  await loadData();
}

async function handleReply(event) {
  event.preventDefault();
  const ticketId = event.target.dataset.replyForm;
  const text = event.target.reply.value.trim();
  if (!text) return;

  await supabase.from("ticket_replies").insert({
    ticket_id: ticketId,
    sender: "admin",
    sender_name: state.session.name,
    message: text,
  });

  const ticket = state.tickets.find((t) => t.id === ticketId);
  if (ticket?.status === "Open") {
    await supabase.from("tickets").update({ status: "In Progress" }).eq("id", ticketId);
  }
 await loadData();
}

async function updateTicketStatus(ticketId, status) {
  await supabase.from("tickets").update({ status }).eq("id", ticketId);
  await loadData();
}

async function deleteTicket(ticketId) {
  const ticket = state.tickets.find((t) => t.id === ticketId);
  const who = ticket ? chamberName(ticket) : ticketId;
  askConfirm({
    title: "Delete support ticket",
    body:
      `${ticketId} — ${who}\n\n` +
      `The whole conversation is removed, including for the grower. ` +
      `They will not be told why it disappeared.\n\nThis cannot be undone.`,
    confirmLabel: "Delete ticket",
    danger: true,
    onConfirm: () => reallyDeleteTicket(ticketId),
  });
}

async function reallyDeleteTicket(ticketId) {
  // Remove replies first (no FK cascade assumed), then the ticket itself.
  // .select() makes the delete return the removed rows so we can tell a
  // real deletion apart from an RLS silent no-op (0 rows, no error).
  await supabase.from("ticket_replies").delete().eq("ticket_id", ticketId);
  const { data: removed, error } = await supabase
    .from("tickets").delete().eq("id", ticketId).select();

  if (error) {
    alert("Delete failed: " + error.message);
    return;
  }
  if (!removed || removed.length === 0) {
    alert(
      "Nothing was deleted. The tickets tables are missing a DELETE policy " +
      "(Row-Level Security). Run Support_delete_policy.sql in Supabase, then try again."
    );
    return;
  }

  if (state.selectedTicketId === ticketId) state.selectedTicketId = null;
  await loadData();
}

async function approveChamber(id) {
  const chamber = state.chambers.find((c) => c.id === id);
  askConfirm({
    title: "Approve chamber",
    body:
      `${chamber?.name || id}\n${chamber?.email || ""}\n\n` +
      `The grower will be able to sign in, and an approval email will be ` +
      `sent to them.`,
    confirmLabel: "Approve",
    danger: false,
    onConfirm: async () => {
      await supabase.from("chambers").update({ status: "Active" }).eq("id", id);
      await emailjs.send("service_hlvie04", "template_g7rrnqw", {
        name: chamber.name,
        chamber_id: chamber.id,
        status: "Approved",
        message: "Your chamber registration has been approved! You can now log in and start using the LactucAIoT App. If you have any questions, feel free to contact our support team.",
        email: chamber.email
      });
      await loadData();
    },
  });
}

async function rejectChamber(id) {
  const chamber = state.chambers.find((c) => c.id === id);
  askConfirm({
    title: "Reject chamber",
    body:
      `${chamber?.name || id}\n${chamber?.email || ""}\n\n` +
      `The registration will be marked Rejected and the grower will be ` +
      `emailed. The record is kept, so this can be reversed by editing ` +
      `the chamber's status.`,
    confirmLabel: "Reject",
    danger: true,
    onConfirm: async () => {
      await supabase.from("chambers").update({ status: "Rejected" }).eq("id", id);
      await emailjs.send("service_hlvie04", "template_g7rrnqw", {
        name: chamber.name,
        chamber_id: chamber.id,
        status: "Rejected",
        message: "Your chamber registration has been rejected. If you have any questions, feel free to contact our support team.",
        email: chamber.email
      });
      await loadData();
    },
  });
}

async function deleteChamber(id) {
  const chamber = state.chambers.find((c) => c.id === id);
  askConfirm({
    title: "Delete chamber",
    body:
      `${chamber?.name || id}\n${chamber?.email || ""}\n\n` +
      `This removes the chamber and its sign-in. Readings, detections ` +
      `and logs already recorded are NOT deleted — they simply lose the ` +
      `chamber they belonged to.\n\nThis cannot be undone.`,
    confirmLabel: "Delete chamber",
    danger: true,
    onConfirm: async () => {
      const { error } = await supabase.from("chambers").delete().eq("id", id);
      if (error) {
        askConfirm({
          title: "Could not delete chamber",
          body: error.message,
          confirmLabel: "Close",
          danger: false,
          onConfirm: async () => {},
        });
        return;
      }
      await loadData();
    },
  });
}

async function deleteAdmin(id) {
  // C-3: removal now takes BOTH sides — the admins row and the Supabase
  // Auth user — through admin_delete_admin().
  //
  // The browser cannot call auth.admin.deleteUser(): that needs the
  // service key, which must never ship to a client. So the deletion runs
  // inside a SECURITY DEFINER function that checks is_admin() first.
  // Leaving the Auth user behind was not merely untidy — it kept the
  // address permanently unusable, because sign-up reports it as taken.
  const admin = state.admins.find((a) => a.id === id);

  askConfirm({
    title: "Remove administrator",
    body:
      `${admin?.name || id}\n${admin?.email || ""}\n\n` +
      `This deletes the admin record and its sign-in account. ` +
      `Access is revoked immediately and the email becomes available ` +
      `again.\n\nThis cannot be undone.`,
    confirmLabel: "Remove admin",
    danger: true,
    onConfirm: async () => {
      const { error } = await supabase.rpc("admin_delete_admin", {
        p_admin_id: id,
      });
      if (error) {
        askConfirm({
          title: "Could not remove admin",
          body: error.message,
          confirmLabel: "Close",
          danger: false,
          onConfirm: async () => {},
        });
        return;
      }
      await loadData();
    },
  });
}

async function loadData() {
  const chamberColumns = "id,name,email,status,registered,device_url,source";

  const [ chambersRes, ticketsRes, adminsRes, repliesRes] = await Promise.all([
    supabase.from("chambers").select(chamberColumns).order("registered", { ascending: false }),
    supabase.from("tickets").select("*").order("created_at", { ascending: false }),
    supabase.from("admins").select("*"),
    supabase.from("ticket_replies").select("*").order("sent_at", { ascending: true })
  ]);

  if (chambersRes.error) {
    console.error("Failed to load chambers:", chambersRes.error);
    state.chambers = [];
  } else {
    state.chambers = chambersRes.data || [];
  }

  state.tickets = ticketsRes.data || [];
  state.admins = adminsRes.data || [];
  state.replies = repliesRes.data || [];

  render();
}

if (state.session) {
  await loadData();
} else {
  await render();
}

document.addEventListener("click", (e) => {
  if (e.target.closest("[data-open-drawer]")) {
    state.drawerOpen = true;
    render();
    return;
  }
  if (e.target.closest("#drawerOverlay")) {
    state.drawerOpen = false;
    render();
    return;
  }
  if (e.target.closest("[data-close-drawer]")) {
    state.drawerOpen = false;
    // render() will be called by the nav/logout handler that also fires
  }
});