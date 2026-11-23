const modal = document.getElementById("formModal");
const authModal = document.getElementById("authModal");
const contactRequestModal = document.getElementById("contactRequestModal");
const inboxModal = document.getElementById("inboxModal");
const flagModal = document.getElementById("flagModal");
const moderationModal = document.getElementById("moderationModal");
const form = document.getElementById("itemForm");
const authForm = document.getElementById("authForm");
const contactRequestForm = document.getElementById("contactRequestForm");
const flagForm = document.getElementById("flagForm");
const itemType = document.getElementById("itemType");
const editingItemId = document.getElementById("editingItemId");
const itemList = document.getElementById("itemList");
const featuredList = document.getElementById("featuredList");
const toast = document.getElementById("toast");
const photoInput = document.getElementById("photo");
const photoPreview = document.getElementById("photoPreview");
const accountStatus = document.getElementById("accountStatus");
const accountButton = document.getElementById("accountButton");
const inboxButton = document.getElementById("inboxButton");
const moderationButton = document.getElementById("moderationButton");
const dataModeNote = document.getElementById("dataModeNote");

const maxPhotoSize = 2 * 1024 * 1024;
const allowedPhotoTypes = ["image/jpeg", "image/png", "image/webp"];
const storageBucket = "report-photos";
const config = window.CAMPUSFIND_SUPABASE_CONFIG || {};
const cloudConfigured = Boolean(config.url && config.anonKey);
const defaultPhotos = {
    "Electronics": "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=800&q=80",
    "School Supplies": "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=800&q=80",
    "Accessories": "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80",
    "Wallet / ID": "https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=800&q=80",
    "Clothing": "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=800&q=80",
    "Other": "https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=800&q=80"
};
const sampleItems = [
    { id: "sample-one", type: "Found", name: "Wireless headphones", category: "Electronics", location: "Student center", date: "2026-11-18", description: "Example listing — black headphones left near the lounge.", status: "active", reporter: "Example student", createdAt: 3, isSample: true },
    { id: "sample-two", type: "Lost", name: "Blue notebook", category: "School Supplies", location: "Library, second floor", date: "2026-11-17", description: "Example listing — a blue notebook with a name on the first page.", status: "active", reporter: "Example student", createdAt: 2, isSample: true },
    { id: "sample-three", type: "Found", name: "Silver watch", category: "Accessories", location: "Science building reception", date: "2026-11-16", description: "Example listing — handed in to the reception desk.", status: "returned", reporter: "Example student", createdAt: 1, isSample: true }
];

let items = [];
let currentUser = null;
let supabaseClient = null;
let contactRequests = [];
let moderationFlags = [];
let isModerator = false;
let backendMode = "local";
let authFormMode = "signin";
let showSamples = false;
let toastTimer;

function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function escapeHtml(value) {
    const element = document.createElement("div");
    element.textContent = String(value ?? "");
    return element.innerHTML;
}

function generateId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, character => {
        const random = Math.floor(Math.random() * 16);
        const value = character === "x" ? random : (random & 0x3) | 0x8;
        return value.toString(16);
    });
}

function isOwner(item) {
    if (item.isSample) return false;
    return backendMode === "local"
        ? item.ownerId === "local"
        : Boolean(currentUser && item.ownerId === currentUser.id);
}

function currentItems() {
    return items.length ? items : (showSamples ? sampleItems : []);
}

function normalizeLocalItems(savedItems) {
    return savedItems.filter(item => item && typeof item === "object").map((item, index) => ({
        ...item,
        id: item.id || `legacy-${index}-${Math.random().toString(36).slice(2, 8)}`,
        ownerId: "local",
        status: item.status === "returned" ? "returned" : "active",
        createdAt: Number(item.createdAt) || savedItems.length - index
    }));
}

function readLocalItems() {
    try {
        const savedItems = JSON.parse(localStorage.getItem("campusFindItems") || "[]");
        return Array.isArray(savedItems) ? normalizeLocalItems(savedItems) : [];
    } catch (error) {
        console.error("Could not read CampusFind reports from local storage.", error);
        showToast("Saved local reports could not be loaded.");
        return [];
    }
}

function writeLocalItems(updatedItems) {
    try {
        localStorage.setItem("campusFindItems", JSON.stringify(updatedItems));
        items = updatedItems;
        return true;
    } catch (error) {
        console.error("Could not update CampusFind reports in local storage.", error);
        showToast("Could not save your change. Browser storage may be full.");
        return false;
    }
}

function updateAccountPanel() {
    if (backendMode === "local") {
        accountStatus.textContent = "Local demo";
        accountButton.hidden = true;
        inboxButton.hidden = true;
        moderationButton.hidden = true;
        dataModeNote.textContent = "Demo mode: reports are saved only in this browser and are not shared with your school or other devices.";
        return;
    }

    if (backendMode === "error") {
        accountStatus.textContent = "Cloud setup needed";
        accountButton.hidden = true;
        inboxButton.hidden = true;
        moderationButton.hidden = true;
        dataModeNote.textContent = "Cloud mode is configured, but the service could not be reached. Check the Supabase project settings and try again.";
        return;
    }

    if (currentUser) {
        accountStatus.textContent = currentUser.email;
        accountButton.textContent = "Sign out";
        accountButton.hidden = false;
        inboxButton.hidden = false;
        moderationButton.hidden = !isModerator;
        dataModeNote.textContent = "Shared cloud mode: reporter contact details stay private. Use Contact reporter to send a request; only report owners can edit or remove their posts.";
        return;
    }

    accountStatus.textContent = "Shared campus reports";
    accountButton.textContent = "Sign in";
    accountButton.hidden = false;
    inboxButton.hidden = true;
    moderationButton.hidden = true;
    dataModeNote.textContent = "Shared cloud mode: sign in to browse reports. Reporter contact details are private; use the contact-request flow instead.";
}

function setAuthFormMode(mode) {
    authFormMode = mode;
    const recovery = mode === "recovery";
    document.getElementById("authTitle").textContent = recovery ? "Choose a new password" : "Sign in to CampusFind";
    document.getElementById("authDescription").textContent = recovery
        ? "Set a new password for your CampusFind account."
        : "Sign in to browse shared reports and manage your own posts.";
    document.getElementById("authPassword").autocomplete = recovery ? "new-password" : "current-password";
    document.getElementById("authPasswordConfirmLabel").hidden = !recovery;
    document.getElementById("authPasswordConfirm").hidden = !recovery;
    document.getElementById("authPasswordConfirm").disabled = !recovery;
    document.getElementById("authPasswordConfirm").required = recovery;
    document.getElementById("signInButton").textContent = recovery ? "Update password" : "Sign in";
    document.getElementById("createAccountButton").hidden = recovery;
    document.getElementById("resetPasswordButton").hidden = recovery;
}

function openAuthForm(mode) {
    if (backendMode !== "cloud") return;
    setAuthFormMode(mode || "signin");
    authModal.style.display = "flex";
    authModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    setTimeout(() => document.getElementById("authEmail").focus(), 100);
}

function closeAuthForm() {
    authModal.classList.add("closing");
    setTimeout(() => {
        authModal.style.display = "none";
        authModal.classList.remove("closing");
        authModal.setAttribute("aria-hidden", "true");
        if (modal.style.display !== "flex") document.body.classList.remove("modal-open");
    }, 180);
}

function openForm(type, id) {
    if (backendMode === "error") {
        showToast("Cloud setup is incomplete. Check the Supabase configuration.");
        return;
    }
    if (backendMode === "cloud" && !currentUser) {
        showToast("Sign in to create or manage reports.");
        openAuthForm();
        return;
    }

    form.reset();
    photoPreview.hidden = true;
    photoPreview.removeAttribute("src");
    editingItemId.value = id || "";
    const item = id ? items.find(report => report.id === id) : null;

    if (item && !isOwner(item)) {
        showToast("You can only edit reports you posted.");
        return;
    }

    itemType.value = item ? item.type : type;
    document.getElementById("formTitle").textContent = item
        ? `Edit ${item.type} Report`
        : `Report ${type} Item`;
    document.querySelector(".submit-report").textContent = item ? "Save changes" : "Submit Report";
    document.getElementById("itemName").value = item ? item.name : "";
    document.getElementById("category").value = item ? item.category : "";
    document.getElementById("location").value = item ? item.location : "";
    document.getElementById("date").value = item ? item.date : "";
    document.getElementById("description").value = item ? item.description : "";
    document.getElementById("reporter").value = item
        ? (getContactLink(item.reporter) ? "" : item.reporter)
        : "";
    document.getElementById("contact").value = item ? item.contact : "";
    document.getElementById("date").max = new Date().toISOString().slice(0, 10);

    if (item && item.photo) {
        photoPreview.src = item.photo;
        photoPreview.hidden = false;
    }

    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    setTimeout(() => document.getElementById("itemName").focus(), 100);
}

function closeForm() {
    modal.classList.add("closing");
    setTimeout(() => {
        modal.style.display = "none";
        modal.classList.remove("closing");
        modal.setAttribute("aria-hidden", "true");
        if (authModal.style.display !== "flex") document.body.classList.remove("modal-open");
        form.reset();
        editingItemId.value = "";
        document.querySelector(".submit-report").textContent = "Submit Report";
        photoPreview.hidden = true;
        photoPreview.removeAttribute("src");
    }, 180);
}

function animateCounter(element, endValue) {
    const startValue = Number(element.textContent) || 0;
    const duration = 450;
    const startTime = performance.now();

    function update(now) {
        const progress = Math.min((now - startTime) / duration, 1);
        element.textContent = Math.round(startValue + (endValue - startValue) * progress);
        if (progress < 1) requestAnimationFrame(update);
    }

    requestAnimationFrame(update);
}

function updateCounts() {
    animateCounter(document.getElementById("totalCount"), items.length);
    animateCounter(document.getElementById("lostCount"), items.filter(item => item.type === "Lost").length);
    animateCounter(document.getElementById("foundCount"), items.filter(item => item.type === "Found").length);
}

function getContactLink(value) {
    const contact = String(value || "").trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) return `mailto:${contact}`;
    if (/^[+()\d.\-\s]{7,}$/.test(contact)) return `tel:${contact.replace(/[^\d+]/g, "")}`;
    return "";
}

function getPublicReporterName(value) {
    const name = String(value || "").trim();
    return getContactLink(name) ? "Campus member" : name;
}

function isValidPhoto(file) {
    return allowedPhotoTypes.includes(file.type) && file.size <= maxPhotoSize;
}

function getItemPhoto(item) {
    return item.photo || defaultPhotos[item.category] || defaultPhotos.Other;
}

function renderItemCard(item, index) {
    const exampleBadge = item.isSample ? `<span class="example-badge">Example only</span>` : "";
    const returnedBadge = item.status === "returned" ? `<span class="returned-badge">Returned</span>` : "";
    const hiddenBadge = item.visibility === "hidden" && (isOwner(item) || isModerator)
        ? `<span class="hidden-badge">Hidden by moderators</span>`
        : "";
    const contactInfo = item.contact
        ? `<span>${escapeHtml(item.contact)}</span>${getContactLink(item.contact)
            ? `<a href="${escapeHtml(getContactLink(item.contact))}">${getContactLink(item.contact).startsWith("mailto:") ? "Email reporter" : "Call reporter"}</a>`
            : ""}`
        : "";
    const publicReporter = getPublicReporterName(item.reporter);
    const ownerActions = isOwner(item) ? `
        <div class="report-actions">
            <button type="button" class="edit-report" data-edit-item="${escapeHtml(item.id)}">Edit</button>
            <button type="button" class="resolve-report" data-toggle-status="${escapeHtml(item.id)}">
                ${item.status === "returned" ? "Reopen report" : "Mark returned"}
            </button>
            <button type="button" class="remove-report" data-remove-item="${escapeHtml(item.id)}">Remove</button>
        </div>
    ` : "";
    const communityActions = !item.isSample && item.visibility !== "hidden" && !isOwner(item) && backendMode === "cloud" && currentUser ? `
        <div class="report-actions community-report-actions">
            <button type="button" class="contact-reporter" data-contact-report="${escapeHtml(item.id)}">Contact reporter</button>
            <button type="button" class="flag-report" data-flag-report="${escapeHtml(item.id)}">Report listing</button>
        </div>
    ` : "";

    return `
        <article class="item-card ${item.status === "returned" ? "is-returned" : ""}" id="report-${escapeHtml(item.id)}" style="animation-delay:${Math.min(index * 70, 350)}ms">
            <div class="item-photo-wrap">
                <img class="item-photo" src="${escapeHtml(getItemPhoto(item))}"
                    alt="${escapeHtml(item.photo ? item.name : `${item.category || "Item"} example photo`)}">
                <span class="item-type ${item.type === "Found" ? "found" : "lost"}">${escapeHtml(item.type || "Report")}</span>
                ${exampleBadge}${returnedBadge}${hiddenBadge}
            </div>
            <div class="item-card-content">
                <p class="item-category">${escapeHtml(item.category || "Other")}</p>
                <h3>${escapeHtml(item.name || "Untitled item")}</h3>
                <p class="item-description">${escapeHtml(item.description || "")}</p>
                <div class="item-meta">
                    <p><span aria-hidden="true">⌖</span> ${escapeHtml(item.location || "Location not provided")}</p>
                    <p><span aria-hidden="true">◷</span> ${escapeHtml(item.date || "Date not provided")}</p>
                </div>
                ${publicReporter || contactInfo ? `<div class="item-contact">
                    ${publicReporter ? `<span>Reported by ${escapeHtml(publicReporter)}</span>` : ""}
                    ${contactInfo}
                </div>` : ""}
                ${ownerActions}
                ${communityActions}
            </div>
        </article>
    `;
}

function displayItems() {
    const search = document.getElementById("search").value.toLowerCase().trim();
    const typeFilter = document.getElementById("filter").value;
    const statusFilter = document.getElementById("statusFilter").value;
    const sort = document.getElementById("sort").value;
    const sourceItems = currentItems();
    const filteredItems = sourceItems.filter(item => {
        const matchesSearch = `${item.name} ${item.category} ${item.location} ${item.description}`.toLowerCase().includes(search);
        const matchesType = typeFilter === "All" || item.type === typeFilter;
        const matchesStatus = statusFilter === "all" || item.status === statusFilter;
        return matchesSearch && matchesType && matchesStatus;
    });

    filteredItems.sort((first, second) => {
        const firstDate = Number(first.createdAt) || 0;
        const secondDate = Number(second.createdAt) || 0;
        return sort === "oldest" ? firstDate - secondDate : secondDate - firstDate;
    });

    document.getElementById("resultCount").textContent = items.length === 0 && showSamples
        ? `${filteredItems.length} example reports`
        : `${filteredItems.length} ${filteredItems.length === 1 ? "report" : "reports"}`;

    if (filteredItems.length === 0) {
        const loginMessage = backendMode === "cloud" && !currentUser
            ? `<p>Sign in to browse shared reports. Contact details are visible only to signed-in members.</p>`
            : `<p>Try another search or filter, or share the first report with your campus.</p>`;
        itemList.innerHTML = `<div class="empty-state">
            <span class="empty-icon" aria-hidden="true">⌕</span>
            <h3>No matching reports</h3>
            ${loginMessage}
            ${items.length === 0 && !showSamples
                ? `<button type="button" class="sample-button" onclick="showSampleReports()">Preview sample reports</button>`
                : ""}
            ${showSamples && items.length === 0
                ? `<button type="button" class="sample-button" data-hide-samples>Hide sample reports</button>`
                : ""}
        </div>`;
        return;
    }

    const sampleNotice = showSamples && items.length === 0
        ? `<div class="sample-notice"><span>These are examples, not real reports.</span><button type="button" data-hide-samples>Hide examples</button></div>`
        : "";
    itemList.innerHTML = `${sampleNotice}${filteredItems.map(renderItemCard).join("")}`;
}

function renderFeaturedCard(item) {
    const example = item.isSample;
    return `
        <article class="feature-card">
            <div class="feature-photo-wrap">
                <img class="feature-photo" src="${escapeHtml(getItemPhoto(item))}"
                    alt="${escapeHtml(item.photo ? item.name : `${item.category || "Item"} example photo`)}">
                <span class="item-type ${item.type === "Found" ? "found" : "lost"}">${escapeHtml(item.type)}</span>
                ${example ? `<span class="example-badge">Example only</span>` : ""}
            </div>
            <div class="feature-content">
                <p class="feature-label">${example ? "Demo preview" : "Latest report"}</p>
                <h3>${escapeHtml(item.name)}</h3>
                <p class="feature-category">${escapeHtml(item.category)}</p>
                <p class="feature-location"><span aria-hidden="true">⌖</span> ${escapeHtml(item.location)}</p>
                ${example
                    ? `<span class="feature-example-note">Not a real report</span>`
                    : `<button type="button" class="feature-action" data-feature-id="${escapeHtml(item.id)}">View report <span aria-hidden="true">→</span></button>`}
            </div>
        </article>
    `;
}

function displayFeatured() {
    const featuredItems = items.length
        ? items.filter(item => item.visibility !== "hidden")
            .sort((first, second) => (Number(second.createdAt) || 0) - (Number(first.createdAt) || 0)).slice(0, 3)
        : (showSamples ? sampleItems : []);

    if (featuredItems.length === 0) {
        const prompt = backendMode === "cloud" && !currentUser
            ? `<button type="button" class="feature-action" onclick="openAuthForm()">Sign in to view reports</button>`
            : `<button type="button" class="feature-action" onclick="showSampleReports()">Preview sample reports</button>`;
        featuredList.innerHTML = `<div class="featured-empty">
            <span class="featured-empty-icon" aria-hidden="true">✦</span>
            <div>
                <h3>Your community starts here</h3>
                <p>Recent lost and found reports will be highlighted here.</p>
            </div>
            ${prompt}
        </div>`;
        return;
    }

    featuredList.innerHTML = featuredItems.map(renderFeaturedCard).join("");
}

function openContactRequest(reportId) {
    if (backendMode !== "cloud" || !currentUser) {
        showToast("Sign in to contact a report owner.");
        openAuthForm();
        return;
    }

    const report = items.find(item => item.id === reportId);
    if (!report || isOwner(report) || report.visibility === "hidden") {
        showToast("This report is not available for contact requests.");
        return;
    }

    contactRequestForm.reset();
    document.getElementById("requestReportId").value = report.id;
    document.getElementById("requestOwnerId").value = report.ownerId;
    document.getElementById("requesterName").value = currentUser.email || "";
    document.getElementById("requesterContact").value = currentUser.email || "";
    document.getElementById("contactRequestItem").textContent = `About: ${report.name}`;
    contactRequestModal.style.display = "flex";
    contactRequestModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    setTimeout(() => document.getElementById("requestMessage").focus(), 100);
}

function closeContactRequestForm() {
    contactRequestModal.classList.add("closing");
    setTimeout(() => {
        contactRequestModal.style.display = "none";
        contactRequestModal.classList.remove("closing");
        contactRequestModal.setAttribute("aria-hidden", "true");
        document.body.classList.remove("modal-open");
        contactRequestForm.reset();
    }, 180);
}

async function submitContactRequest(event) {
    event.preventDefault();
    if (!currentUser) return;

    const request = {
        report_id: document.getElementById("requestReportId").value,
        owner_id: document.getElementById("requestOwnerId").value,
        requester_id: currentUser.id,
        requester_name: document.getElementById("requesterName").value.trim(),
        requester_contact: document.getElementById("requesterContact").value.trim(),
        message: document.getElementById("requestMessage").value.trim()
    };

    try {
        const { error } = await supabaseClient.from("contact_requests").insert(request);
        if (error) {
            if (error.code === "23505") {
                showToast("You have already sent a request for this report.");
                return;
            }
            throw error;
        }
        closeContactRequestForm();
        showToast("Private contact request sent");
    } catch (error) {
        console.error("Could not send contact request.", error);
        showToast("Could not send the request. Please try again.");
    }
}

function closeInbox() {
    inboxModal.classList.add("closing");
    setTimeout(() => {
        inboxModal.style.display = "none";
        inboxModal.classList.remove("closing");
        inboxModal.setAttribute("aria-hidden", "true");
        document.body.classList.remove("modal-open");
    }, 180);
}

async function loadInbox() {
    if (!currentUser) return;

    try {
        const { data, error } = await supabaseClient
            .from("contact_requests")
            .select("*")
            .order("created_at", { ascending: false });
        if (error) throw error;
        contactRequests = data;
        renderInbox();
    } catch (error) {
        console.error("Could not load contact requests.", error);
        showToast("Could not load your inbox. Please try again.");
    }
}

function renderInbox() {
    if (!contactRequests.length) {
        document.getElementById("inboxList").innerHTML =
            `<div class="inbox-empty"><h3>No requests yet</h3><p>Contact requests about your reports will appear here.</p></div>`;
        return;
    }

    document.getElementById("inboxList").innerHTML = contactRequests.map(request => {
        const incoming = request.owner_id === currentUser.id;
        const report = items.find(item => item.id === request.report_id);
        const contactLink = getContactLink(request.requester_contact);
        const replyLink = contactLink && contactLink.startsWith("mailto:")
            ? `${contactLink}?subject=${encodeURIComponent(`CampusFind: ${report ? report.name : "your item"}`)}`
            : contactLink;

        return `
            <article class="inbox-card">
                <div class="inbox-card-heading">
                    <span class="inbox-state ${request.status === "closed" ? "closed" : ""}">${request.status === "closed" ? "Handled" : (incoming ? "New request" : "Sent")}</span>
                    <span class="inbox-date">${escapeHtml(new Date(request.created_at).toLocaleDateString())}</span>
                </div>
                <h3>${escapeHtml(report ? report.name : "CampusFind report")}</h3>
                ${incoming
                    ? `<p><strong>From:</strong> ${escapeHtml(request.requester_name)} · ${escapeHtml(request.requester_contact)}</p>`
                    : `<p><strong>Your request:</strong> ${escapeHtml(request.requester_contact)}</p>`}
                <p class="inbox-message">${escapeHtml(request.message)}</p>
                ${incoming && contactLink ? `<a class="inbox-reply" href="${escapeHtml(replyLink)}">Reply to requester</a>` : ""}
                ${incoming && request.status === "pending"
                    ? `<button type="button" class="resolve-report" data-close-request="${escapeHtml(request.id)}">Mark handled</button>`
                    : ""}
            </article>
        `;
    }).join("");
}

async function markRequestHandled(id) {
    const { error } = await supabaseClient
        .from("contact_requests")
        .update({ status: "closed", updated_at: new Date().toISOString() })
        .eq("id", id);
    if (error) {
        console.error("Could not update contact request.", error);
        showToast("Could not update the request. Please try again.");
        return;
    }
    await loadInbox();
    showToast("Request marked as handled");
}

function openFlagForm(reportId) {
    if (backendMode !== "cloud" || !currentUser) {
        showToast("Sign in to report a listing.");
        openAuthForm();
        return;
    }
    const report = items.find(item => item.id === reportId);
    if (!report || isOwner(report) || report.visibility === "hidden") {
        showToast("This listing cannot be reported.");
        return;
    }

    flagForm.reset();
    document.getElementById("flagReportId").value = report.id;
    document.getElementById("flagItemName").textContent = `Listing: ${report.name}`;
    flagModal.style.display = "flex";
    flagModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    setTimeout(() => document.getElementById("flagReason").focus(), 100);
}

function closeFlagForm() {
    flagModal.classList.add("closing");
    setTimeout(() => {
        flagModal.style.display = "none";
        flagModal.classList.remove("closing");
        flagModal.setAttribute("aria-hidden", "true");
        document.body.classList.remove("modal-open");
        flagForm.reset();
    }, 180);
}

async function submitFlag(event) {
    event.preventDefault();
    if (!currentUser) return;

    try {
        const { error } = await supabaseClient.from("moderation_flags").insert({
            report_id: document.getElementById("flagReportId").value,
            reporter_id: currentUser.id,
            reason: document.getElementById("flagReason").value,
            details: document.getElementById("flagDetails").value.trim()
        });
        if (error) {
            if (error.code === "23505") {
                showToast("You have already reported this listing.");
                return;
            }
            throw error;
        }
        closeFlagForm();
        showToast("Listing sent to moderators for review");
    } catch (error) {
        console.error("Could not flag report.", error);
        showToast("Could not submit the report. Please try again.");
    }
}

function closeModeration() {
    moderationModal.classList.add("closing");
    setTimeout(() => {
        moderationModal.style.display = "none";
        moderationModal.classList.remove("closing");
        moderationModal.setAttribute("aria-hidden", "true");
        document.body.classList.remove("modal-open");
    }, 180);
}

async function loadModerationQueue() {
    if (!isModerator) return;
    try {
        const { data, error } = await supabaseClient
            .from("moderation_flags")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(50);
        if (error) throw error;
        moderationFlags = data;
        renderModerationQueue();
    } catch (error) {
        console.error("Could not load moderation queue.", error);
        showToast("Could not load flagged reports.");
    }
}

function renderModerationQueue() {
    const list = document.getElementById("moderationList");
    if (!moderationFlags.length) {
        list.innerHTML = `<div class="inbox-empty"><h3>Queue is clear</h3><p>New community flags will appear here.</p></div>`;
        return;
    }

    list.innerHTML = moderationFlags.map(flag => {
        const report = items.find(item => item.id === flag.report_id);
        return `
            <article class="inbox-card moderation-card">
                <div class="inbox-card-heading">
                    <span class="inbox-state ${flag.status === "reviewed" ? "closed" : ""}">${flag.status === "reviewed" ? "Reviewed" : "Needs review"}</span>
                    <span class="inbox-date">${escapeHtml(new Date(flag.created_at).toLocaleDateString())}</span>
                </div>
                <h3>${escapeHtml(report ? report.name : "Unavailable listing")}</h3>
                <p><strong>Reason:</strong> ${escapeHtml(flag.reason)}</p>
                <p class="inbox-message">${escapeHtml(flag.details || "No additional details provided.")}</p>
                <div class="report-actions">
                    ${report ? `<button type="button" class="resolve-report" data-moderate-report="${escapeHtml(report.id)}" data-visibility="${report.visibility === "hidden" ? "visible" : "hidden"}">${report.visibility === "hidden" ? "Restore listing" : "Hide listing"}</button>` : ""}
                    ${flag.status === "open" ? `<button type="button" class="edit-report" data-resolve-flag="${escapeHtml(flag.id)}">Mark reviewed</button>` : ""}
                </div>
            </article>
        `;
    }).join("");
}

async function setReportVisibility(reportId, visibility) {
    const { error } = await supabaseClient.from("reports")
        .update({ visibility, updated_at: new Date().toISOString() })
        .eq("id", reportId);
    if (error) {
        console.error("Could not change report visibility.", error);
        showToast("Could not update report visibility.");
        return;
    }
    items = items.map(item => item.id === reportId ? { ...item, visibility } : item);
    renderAll();
    renderModerationQueue();
    showToast(visibility === "hidden" ? "Listing hidden from the community" : "Listing restored");
}

async function resolveModerationFlag(flagId) {
    const { error } = await supabaseClient.from("moderation_flags")
        .update({ status: "reviewed" })
        .eq("id", flagId);
    if (error) {
        console.error("Could not resolve moderation flag.", error);
        showToast("Could not mark the flag as reviewed.");
        return;
    }
    await loadModerationQueue();
}

function renderAll() {
    displayItems();
    displayFeatured();
    updateCounts();
}

function showSampleReports() {
    showSamples = !showSamples;
    renderAll();
}

function showFeaturedReport(id) {
    document.getElementById("search").value = "";
    document.getElementById("filter").value = "All";
    document.getElementById("statusFilter").value = "all";
    document.getElementById("sort").value = "newest";
    displayItems();

    const report = document.getElementById(`report-${id}`);
    if (!report) return;

    report.scrollIntoView({ behavior: "smooth", block: "center" });
    report.classList.add("item-card-highlight");
    setTimeout(() => report.classList.remove("item-card-highlight"), 1800);
}

function clearSearch() {
    document.getElementById("search").value = "";
    document.getElementById("filter").value = "All";
    document.getElementById("sort").value = "newest";
    document.getElementById("statusFilter").value = "active";
    displayItems();
}

async function loadCloudItems() {
    if (!currentUser) {
        items = [];
        renderAll();
        return;
    }

    items = [];
    renderAll();
    const { data, error } = await supabaseClient
        .from("reports")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Could not load cloud reports.", error);
        showToast("Could not load reports. Check the database setup and try again.");
        return;
    }

    const { data: contactRows, error: contactError } = await supabaseClient
        .from("report_contacts")
        .select("report_id, contact");
    if (contactError) {
        console.error("Could not load private report contacts.", contactError);
        showToast("Report details loaded, but private contact information could not be loaded.");
    }
    const privateContacts = new Map((contactRows || []).map(row => [row.report_id, row.contact]));

    let photoLoadFailed = false;
    const mappedItems = await Promise.all(data.map(async row => {
        let photo = "";
        if (row.photo_path) {
            const { data: signedPhoto, error: photoError } = await supabaseClient
                .storage.from(storageBucket).createSignedUrl(row.photo_path, 3600);
            if (photoError) {
                console.error(`Could not load photo for report ${row.id}.`, photoError);
                photoLoadFailed = true;
            } else {
                photo = signedPhoto.signedUrl;
            }
        }

        return {
            id: row.id,
            ownerId: row.owner_id,
            type: row.type,
            name: row.name,
            category: row.category,
            location: row.location,
            date: row.item_date,
            description: row.description,
            reporter: row.reporter,
            contact: privateContacts.get(row.id) || "",
            photoPath: row.photo_path,
            photo,
            status: row.status,
            visibility: row.visibility,
            createdAt: new Date(row.created_at).getTime()
        };
    }));

    items = mappedItems;
    showSamples = false;
    renderAll();
    if (photoLoadFailed) showToast("Some report photos could not be loaded.");
}

async function updateModeratorStatus() {
    isModerator = false;
    if (!currentUser) {
        updateAccountPanel();
        return;
    }

    const { data, error } = await supabaseClient
        .from("moderators")
        .select("user_id")
        .eq("user_id", currentUser.id)
        .maybeSingle();
    if (error) {
        console.error("Could not check CampusFind moderator access.", error);
        showToast("Moderator access could not be checked.");
    } else {
        isModerator = Boolean(data);
    }
    updateAccountPanel();
}

async function startCloudMode() {
    backendMode = "cloud";
    updateAccountPanel();

    try {
        if (!window.supabase || !window.supabase.createClient) {
            throw new Error("Supabase client library did not load.");
        }

        supabaseClient = window.supabase.createClient(config.url, config.anonKey);
        supabaseClient.auth.onAuthStateChange((event, session) => {
            setTimeout(() => {
                currentUser = session ? session.user : null;
                updateModeratorStatus().then(() => loadCloudItems()).catch(error => {
                    console.error("Could not update the signed-in user state.", error);
                    showToast("Could not refresh account access. Please try again.");
                });
                if (event === "PASSWORD_RECOVERY") {
                    document.getElementById("authEmail").value = session && session.user ? session.user.email || "" : "";
                    openAuthForm("recovery");
                }
            }, 0);
        });

        const { data, error } = await supabaseClient.auth.getSession();
        if (error) throw error;

        currentUser = data.session ? data.session.user : null;
        await updateModeratorStatus();
        await loadCloudItems();
    } catch (error) {
        console.error("Could not connect to Supabase.", error);
        backendMode = "error";
        updateAccountPanel();
        renderAll();
        showToast("Cloud setup failed. Check supabase-config.js and supabase-setup.sql.");
    }
}

function loadSupabaseSdk() {
    return new Promise((resolve, reject) => {
        const sdk = document.createElement("script");
        sdk.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
        sdk.onload = resolve;
        sdk.onerror = () => reject(new Error("Could not load the Supabase client from the CDN."));
        document.head.appendChild(sdk);
    });
}

function updateReportStatus(id) {
    const item = items.find(report => report.id === id);
    if (!item || !isOwner(item)) {
        showToast("You can only update reports you posted.");
        return;
    }

    const nextStatus = item.status === "returned" ? "active" : "returned";
    if (backendMode === "cloud") {
        supabaseClient.from("reports")
            .update({ status: nextStatus, updated_at: new Date().toISOString() })
            .eq("id", id)
            .then(({ error }) => {
                if (error) {
                    console.error("Could not update report status.", error);
                    showToast("Could not update this report. Please try again.");
                    return;
                }
                items = items.map(report => report.id === id ? { ...report, status: nextStatus } : report);
                document.getElementById("statusFilter").value = "all";
                renderAll();
                showToast(nextStatus === "returned" ? "Marked as returned" : "Report reopened");
            })
            .catch(error => {
                console.error("Could not update report status.", error);
                showToast("Could not update this report. Please try again.");
            });
        return;
    }

    const updatedItems = items.map(report => report.id === id
        ? { ...report, status: nextStatus, updatedAt: Date.now() }
        : report);
    if (writeLocalItems(updatedItems)) {
        document.getElementById("statusFilter").value = "all";
        renderAll();
        showToast(nextStatus === "returned" ? "Marked as returned" : "Report reopened");
    }
}

async function removeItem(id) {
    const item = items.find(report => report.id === id);
    if (!item || !isOwner(item) || !window.confirm(`Remove the report for "${item.name}"?`)) return;

    let photoCleanupFailed = false;
    if (backendMode === "cloud") {
        const { error } = await supabaseClient.from("reports").delete().eq("id", id);
        if (error) {
            console.error("Could not remove cloud report.", error);
            showToast("Could not remove this report. Please try again.");
            return;
        }

        if (item.photoPath) {
            const { error: photoError } = await supabaseClient.storage.from(storageBucket).remove([item.photoPath]);
            if (photoError) {
                console.error("Report was removed, but its photo could not be deleted.", photoError);
                photoCleanupFailed = true;
            }
        }
        items = items.filter(report => report.id !== id);
    } else {
        const updatedItems = items.filter(report => report.id !== id);
        if (!writeLocalItems(updatedItems)) return;
    }

    renderAll();
    showToast(photoCleanupFailed ? "Report removed, but its photo could not be cleaned up." : "Report removed");
}

async function savePhoto(file, reportId, existingPath) {
    if (!file) return { photo: "", photoPath: existingPath || "" };
    if (!isValidPhoto(file)) {
        throw new Error("Choose a JPG, PNG, or WebP image smaller than 2 MB.");
    }

    if (backendMode === "local") {
        const photo = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error("Could not read this image. Try another file."));
            reader.readAsDataURL(file);
        });
        return { photo, photoPath: "" };
    }

    const extension = file.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "");
    const photoPath = `${currentUser.id}/${reportId}-${Date.now()}.${extension || "img"}`;
    const { error } = await supabaseClient.storage.from(storageBucket).upload(photoPath, file, {
        cacheControl: "3600",
        upsert: false
    });
    if (error) throw error;
    return { photo: "", photoPath };
}

async function saveReport(event) {
    event.preventDefault();
    if (backendMode === "cloud" && !currentUser) {
        showToast("Sign in to submit a report.");
        openAuthForm();
        return;
    }
    if (backendMode === "error") {
        showToast("Cloud setup is incomplete. Check the Supabase configuration.");
        return;
    }

    const id = editingItemId.value || generateId();
    const existing = editingItemId.value ? items.find(item => item.id === id) : null;
    if (existing && !isOwner(existing)) {
        showToast("You can only edit reports you posted.");
        return;
    }

    const reporterName = document.getElementById("reporter").value.trim();
    if (getContactLink(reporterName)) {
        showToast("Use a name or nickname here. Keep email and phone in the private contact field.");
        document.getElementById("reporter").focus();
        return;
    }

    const file = photoInput.files[0];
    let uploadedPath = "";
    let oldPhotoCleanupFailed = false;
    try {
        const photoData = await savePhoto(file, id, existing && existing.photoPath);
        uploadedPath = photoData.photoPath && photoData.photoPath !== (existing && existing.photoPath)
            ? photoData.photoPath
            : "";
        const report = {
            id,
            ownerId: backendMode === "cloud" ? currentUser.id : "local",
            type: itemType.value,
            name: document.getElementById("itemName").value.trim(),
            category: document.getElementById("category").value,
            location: document.getElementById("location").value.trim(),
            date: document.getElementById("date").value,
            description: document.getElementById("description").value.trim(),
            reporter: reporterName,
            contact: document.getElementById("contact").value.trim(),
            photo: photoData.photo || (existing ? existing.photo : ""),
            photoPath: photoData.photoPath || "",
            status: existing ? existing.status : "active",
            visibility: existing ? existing.visibility || "visible" : "visible",
            createdAt: existing ? existing.createdAt : Date.now(),
            updatedAt: Date.now()
        };

        if (backendMode === "cloud") {
            const { error } = await supabaseClient.rpc("save_campusfind_report", {
                p_id: report.id,
                p_type: report.type,
                p_name: report.name,
                p_category: report.category,
                p_location: report.location,
                p_item_date: report.date,
                p_description: report.description,
                p_reporter: report.reporter,
                p_contact: report.contact,
                p_photo_path: report.photoPath || null
            });
            if (error) throw error;
            if (existing && existing.photoPath && existing.photoPath !== report.photoPath) {
                const { error: cleanupError } = await supabaseClient.storage.from(storageBucket).remove([existing.photoPath]);
                if (cleanupError) {
                    console.error("Updated report photo, but the previous photo could not be removed.", cleanupError);
                    oldPhotoCleanupFailed = true;
                }
            }
            await loadCloudItems();
        } else {
            const updatedItems = existing
                ? items.map(item => item.id === id ? report : item)
                : [report, ...items];
            if (!writeLocalItems(updatedItems)) {
                if (uploadedPath) await supabaseClient.storage.from(storageBucket).remove([uploadedPath]);
                return;
            }
            renderAll();
        }

        closeForm();
        showToast(oldPhotoCleanupFailed
            ? "Report updated, but its previous photo could not be cleaned up."
            : (existing ? "Report updated" : "Report submitted"));
        document.getElementById("items").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
        console.error("Could not save CampusFind report.", error);
        if (uploadedPath && backendMode === "cloud") {
            const { error: cleanupError } = await supabaseClient.storage.from(storageBucket).remove([uploadedPath]);
            if (cleanupError) console.error("Could not clean up an unused report photo.", cleanupError);
        }
        showToast(error.message === "Choose a JPG, PNG, or WebP image smaller than 2 MB."
            || error.message === "Could not read this image. Try another file."
            ? error.message
            : "Could not save the report. Check your connection and try again.");
    }
}

async function handleAuthentication(event) {
    event.preventDefault();
    const email = document.getElementById("authEmail").value.trim();
    const password = document.getElementById("authPassword").value;
    const submitter = event.submitter;
    const creatingAccount = submitter && submitter.id === "createAccountButton";

    if (creatingAccount && !["http:", "https:"].includes(window.location.protocol)) {
        showToast("Open CampusFind through Live Server or HTTPS before creating an account.");
        return;
    }

    try {
        if (authFormMode === "recovery") {
            const confirmation = document.getElementById("authPasswordConfirm").value;
            if (password !== confirmation) {
                showToast("The passwords do not match.");
                return;
            }
            const { error } = await supabaseClient.auth.updateUser({ password });
            if (error) throw error;
            authForm.reset();
            setAuthFormMode("signin");
            closeAuthForm();
            showToast("Password updated");
            return;
        }

        if (creatingAccount) {
            const redirectUrl = new URL(window.location.pathname, window.location.origin).href;
            const { data, error } = await supabaseClient.auth.signUp({
                email,
                password,
                options: { emailRedirectTo: redirectUrl }
            });
            if (error) throw error;
            if (!data.session) {
                showToast("Check your email to confirm your new account.");
                return;
            }
            currentUser = data.session.user;
            closeAuthForm();
            await updateModeratorStatus();
            await loadCloudItems();
            showToast("Account created");
            return;
        }

        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        currentUser = data.user;
        closeAuthForm();
        await updateModeratorStatus();
        await loadCloudItems();
        showToast("Signed in");
    } catch (error) {
        console.error("CampusFind authentication failed.", error);
        showToast(error.message || "Could not sign in. Check your details and try again.");
    }
}

async function resetPassword() {
    const email = document.getElementById("authEmail").value.trim();
    if (!email) {
        showToast("Enter your email address first.");
        document.getElementById("authEmail").focus();
        return;
    }

    try {
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email);
        if (error) throw error;
        showToast("If the account exists, a password reset email is on its way.");
    } catch (error) {
        console.error("Could not send password reset email.", error);
        showToast("Could not send the reset email. Check the address and try again.");
    }
}

function openReportActions(event) {
    const contactButton = event.target.closest("[data-contact-report]");
    if (contactButton) {
        openContactRequest(contactButton.dataset.contactReport);
        return;
    }
    const flagButton = event.target.closest("[data-flag-report]");
    if (flagButton) {
        openFlagForm(flagButton.dataset.flagReport);
        return;
    }
    const editButton = event.target.closest("[data-edit-item]");
    if (editButton) {
        openForm("", editButton.dataset.editItem);
        return;
    }
    const statusButton = event.target.closest("[data-toggle-status]");
    if (statusButton) {
        updateReportStatus(statusButton.dataset.toggleStatus);
        return;
    }
    const removeButton = event.target.closest("[data-remove-item]");
    if (removeButton) {
        removeItem(removeButton.dataset.removeItem).catch(error => {
            console.error("Could not remove CampusFind report.", error);
            showToast("Could not remove this report. Please try again.");
        });
    }
}

itemList.addEventListener("click", openReportActions);
itemList.addEventListener("click", event => {
    if (event.target.closest("[data-hide-samples]")) showSampleReports();
});
itemList.addEventListener("error", event => {
    if (event.target.matches(".item-photo")) event.target.hidden = true;
}, true);

featuredList.addEventListener("click", event => {
    const featureButton = event.target.closest("[data-feature-id]");
    if (featureButton) showFeaturedReport(featureButton.dataset.featureId);
});
featuredList.addEventListener("error", event => {
    if (event.target.matches(".feature-photo")) event.target.hidden = true;
}, true);

photoInput.addEventListener("change", () => {
    const file = photoInput.files[0];
    if (!file) {
        photoPreview.hidden = true;
        photoPreview.removeAttribute("src");
        return;
    }
    if (!isValidPhoto(file)) {
        photoInput.value = "";
        photoPreview.hidden = true;
        photoPreview.removeAttribute("src");
        showToast("Choose a JPG, PNG, or WebP image smaller than 2 MB.");
        return;
    }
    const reader = new FileReader();
    reader.onload = () => {
        photoPreview.src = reader.result;
        photoPreview.hidden = false;
    };
    reader.onerror = () => showToast("Could not preview this image. Try another file.");
    reader.readAsDataURL(file);
});

form.addEventListener("submit", saveReport);
authForm.addEventListener("submit", handleAuthentication);
contactRequestForm.addEventListener("submit", submitContactRequest);
flagForm.addEventListener("submit", submitFlag);
document.getElementById("resetPasswordButton").addEventListener("click", resetPassword);
inboxButton.addEventListener("click", async () => {
    inboxModal.style.display = "flex";
    inboxModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    await loadInbox();
});
document.getElementById("inboxList").addEventListener("click", event => {
    const button = event.target.closest("[data-close-request]");
    if (button) {
        markRequestHandled(button.dataset.closeRequest).catch(error => {
            console.error("Could not update contact request.", error);
            showToast("Could not update the request. Please try again.");
        });
    }
});
moderationButton.addEventListener("click", async () => {
    moderationModal.style.display = "flex";
    moderationModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    await loadModerationQueue();
});
document.getElementById("moderationList").addEventListener("click", event => {
    const visibilityButton = event.target.closest("[data-moderate-report]");
    if (visibilityButton) {
        setReportVisibility(visibilityButton.dataset.moderateReport, visibilityButton.dataset.visibility)
            .catch(error => {
                console.error("Could not moderate report.", error);
                showToast("Could not update report visibility.");
            });
        return;
    }
    const flagButton = event.target.closest("[data-resolve-flag]");
    if (flagButton) {
        resolveModerationFlag(flagButton.dataset.resolveFlag).catch(error => {
            console.error("Could not resolve moderation flag.", error);
            showToast("Could not mark the flag as reviewed.");
        });
    }
});
accountButton.addEventListener("click", async () => {
    if (!currentUser) {
        openAuthForm();
        return;
    }
    try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;
        currentUser = null;
        isModerator = false;
        updateAccountPanel();
        await loadCloudItems();
        showToast("Signed out");
    } catch (error) {
        console.error("Could not sign out.", error);
        showToast("Could not sign out. Please try again.");
    }
});
modal.addEventListener("click", event => {
    if (event.target === modal) closeForm();
});
authModal.addEventListener("click", event => {
    if (event.target === authModal) closeAuthForm();
});
contactRequestModal.addEventListener("click", event => {
    if (event.target === contactRequestModal) closeContactRequestForm();
});
inboxModal.addEventListener("click", event => {
    if (event.target === inboxModal) closeInbox();
});
flagModal.addEventListener("click", event => {
    if (event.target === flagModal) closeFlagForm();
});
moderationModal.addEventListener("click", event => {
    if (event.target === moderationModal) closeModeration();
});
document.addEventListener("keydown", event => {
    if (event.key === "Escape" && modal.style.display === "flex") closeForm();
    else if (event.key === "Escape" && authModal.style.display === "flex") closeAuthForm();
    else if (event.key === "Escape" && contactRequestModal.style.display === "flex") closeContactRequestForm();
    else if (event.key === "Escape" && inboxModal.style.display === "flex") closeInbox();
    else if (event.key === "Escape" && flagModal.style.display === "flex") closeFlagForm();
    else if (event.key === "Escape" && moderationModal.style.display === "flex") closeModeration();
});

const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
        }
    });
}, { threshold: 0.12 });
document.querySelectorAll(".stats, .featured-section, #items, #about").forEach(section => observer.observe(section));

async function initialize() {
    if (!cloudConfigured) {
        backendMode = "local";
        items = readLocalItems();
        updateAccountPanel();
        renderAll();
        return;
    }

    try {
        await loadSupabaseSdk();
        await startCloudMode();
    } catch (error) {
        console.error("Could not load Supabase client library.", error);
        backendMode = "error";
        updateAccountPanel();
        renderAll();
        showToast("Could not load the cloud service. Check your internet connection.");
    }
}

initialize();
