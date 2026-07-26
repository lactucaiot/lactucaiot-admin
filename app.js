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
  return "";
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
          <div class="field span-2">
            <label for="chamberApiKey">API Key</label>
            <div class="password-wrap">
              <input id="chamberApiKey" name="api_key" type="text" value="${esc(item?.api_key || "")}" readonly />
              <button type="button" class="icon-button" data-generate-api-key aria-label="Generate new API key"><i class="ti ti-refresh"></i></button>
            </div>
            <small class="field-hint">Sent by the RPi4 as X-API-Key — regenerate if this chamber's key is ever compromised.</small>
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
            <div class="field"><label>Email</label><input name="email" type="email" value="${esc(item?.email || "")}" required /></div>
            <div class="field">
              <label for="adminPassword">Password</label>
              <div class="password-wrap">
                <input id="adminPassword" name="password" type="password" ${item ? "" : "required"} />
                <button type="button" class="icon-button" data-toggle-input-password data-target="adminPassword"><i class="ti ti-eye"></i></button>
              </div>
              ${item ? `<small class="field-hint">Leave blank to keep current password.</small>` : ""}
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

  document.querySelectorAll("[data-generate-api-key]").forEach((button) => {
    button.addEventListener("click", () => {
      document.getElementById("chamberApiKey").value = crypto.randomUUID().replace(/-/g, "");
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
    button.addEventListener("click", () => {
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
      state.modal = null;
      render();
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

async function handleLogin(event) {
  event.preventDefault();
  const role = document.querySelector("[data-login-role].active").dataset.loginRole;
  const email = document.querySelector("#loginEmail").value.trim().toLowerCase();
  const password = document.querySelector("#loginPassword").value;
  
  const { data, error } = await supabase
    .from("admins")
    .select("*")
    .eq("email", email)
    .eq("role", role)
    .single();

  if (error || !data) {
    state.error = "Invalid email, password, or selected role.";
    render();
    return;
  }

  const passwordMatches = await checkPasswordMatch(password, data.password);
  if (!passwordMatches) {
    state.error = "Invalid email, password, or selected role.";
    render();
    return;
  }

  if (data.status !== "Active") {
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

function getNextIdFor(kind) {
  const existing = kind === "chamber" ? state.chambers : state.admins;
  const ids = (existing || []).map((item) => String(item?.id || "")).filter(Boolean);

  for (const id of ids) {
    const match = id.match(/^(.*?)(\d+)\s*$/);
    if (match) {
      const prefix = match[1];
      const number = parseInt(match[2], 10);
      const digits = match[2].length;
      return `${prefix}${String(number + 1).padStart(digits, "0")}`;
    }
  }

  return kind === "chamber" ? "LC-AIOT-001" : "ADM-001";
}

async function resolveNextId(kind) {
  const rpcName = kind === "chamber" ? "peek_next_chamber_id" : "peek_next_admin_id";

  try {
    const { data, error } = await supabase.rpc(rpcName);
    if (!error && data) return data;
  } catch (error) {
    console.warn(`RPC ${rpcName} unavailable, using a local fallback ID.`, error);
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
      const updatePayload = {
        name: data.name.trim(),
        email: data.email.trim(),
        device_url: data.device_url ? data.device_url.trim() : null,
        api_key: data.api_key ? data.api_key.trim() : null,
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
      const id = state.nextChamberId || (await resolveNextId("chamber"));
      const { error } = await supabase.from("chambers").insert({
        id,
        name: data.name.trim(),
        email: data.email.trim(),
        password: await hashPassword(data.password),
        status: "Active",
        registered: new Date().toISOString().slice(0, 10),
        source: "admin",
        device_url: data.device_url ? data.device_url.trim() : null,
        api_key: data.api_key ? data.api_key.trim() : null,
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
      const updatePayload = {
        name: data.name.trim(),
        email: data.email.trim(),
        role: data.role,
      };

      if (data.password) {
        updatePayload.password = await hashPassword(data.password);
      }
      if (existing?.status) {
        updatePayload.status = existing.status;
      }

      const { error } = await supabase.from("admins").update(updatePayload).eq("id", data.id);
      if (error) throw error;
    } else {
      const id = state.nextAdminId || (await resolveNextId("admin"));
      const { error } = await supabase.from("admins").insert({
        id,
        name: data.name.trim(),
        email: data.email.trim(),
        password: await hashPassword(data.password),
        role: data.role,
        status: "Active",
      });
      if (error) throw error;
    }

    state.modal = null;
    await loadData();
  } catch (error) {
    console.error("Failed to save admin:", error);
    alert("Unable to save admin. Check the browser console for details.");
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
  if (!confirm(`Delete ticket ${ticketId} from ${who}? This removes it for the user too and cannot be undone.`)) return;

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
  if (!confirm(`Approve chamber ${id}?`)) return;
  await supabase.from("chambers").update({ status: "Active" }).eq("id", id);
  const chamber = state.chambers.find((c) => c.id === id);
  await emailjs.send("service_hlvie04","template_g7rrnqw", {
    name: chamber.name,
    chamber_id: chamber.id,
    status: "Approved",
    message: "Your chamber registration has been approved! You can now log in and start using the LactucAIoT App. If you have any questions, feel free to contact our support team.",
    email: chamber.email
  });
  await loadData();
}

async function rejectChamber(id) {
  if (!confirm(`Reject chamber ${id}?`)) return;
  await supabase.from("chambers").update({ status: "Rejected" }).eq("id", id);
  const chamber = state.chambers.find((c) => c.id === id);
  await emailjs.send("service_hlvie04","template_g7rrnqw", {
    name: chamber.name,
    chamber_id: chamber.id,
    status: "Rejected",
    message: "Your chamber registration has been rejected. If you have any questions, feel free to contact our support team.",
    email: chamber.email
  });
  await loadData();
}

async function deleteChamber(id) {
  if (!confirm(`Delete chamber ${id}?`)) return;
  await supabase.from("chambers").delete().eq("id", id);
  await loadData();
}

async function deleteAdmin(id) {
  if (!confirm(`Remove admin ${id}?`)) return;
  await supabase.from("admins").delete().eq("id", id);
  await loadData();
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