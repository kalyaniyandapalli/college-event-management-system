import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  updateDoc
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  AlertCircle,
  Check,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  MoreVertical,
  Pencil,
  Save,
  ShieldCheck,
  Trash2,
  Users,
  X,
  XCircle
} from "lucide-react";
import { auth, db } from "./firebase";
import "./organizers-manager.css";

const PERMISSIONS = [
  { key: "manageEvents", label: "Manage events", description: "Create and update campus events" },
  { key: "manageContent", label: "Edit website content", description: "Update homepage and website content" },
  { key: "viewRegistrations", label: "View registrations", description: "Review student event registrations" },
  { key: "manageMessages", label: "Manage student messages", description: "Review and manage contact messages" },
  { key: "manageOrganizers", label: "Manage organizers", description: "Edit organizer permissions" },
  { key: "approveOrganizers", label: "Approve organizer applications", description: "Approve or reject applications" }
];

const EMPTY_PERMISSIONS = {
  manageEvents: false,
  manageContent: false,
  viewRegistrations: false,
  manageMessages: false,
  manageOrganizers: false,
  approveOrganizers: false
};

export default function OrganizersManager() {
  const navigate = useNavigate();
  const [organizers, setOrganizers] = useState([]);
  const [currentOrganizer, setCurrentOrganizer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savingUid, setSavingUid] = useState("");
  const [deletingUid, setDeletingUid] = useState("");
  const [confirmDeleteItem, setConfirmDeleteItem] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [editingUid, setEditingUid] = useState("");
  const [openMenuUid, setOpenMenuUid] = useState("");
  const [menuPosition, setMenuPosition] = useState({ top: 12, left: 12 });

  useEffect(() => {
    const user = auth.currentUser;

    if (!user) {
      setError("Please sign in with an authorized organizer account.");
      setLoading(false);
      return undefined;
    }

    const stopCurrent = onSnapshot(
      doc(db, "organizers", user.uid),
      (snapshot) => {
        setCurrentOrganizer(
          snapshot.exists() ? { uid: snapshot.id, ...snapshot.data() } : null
        );
      },
      (err) => {
        console.error("Organizer access check failed:", err);
        setError("Unable to verify your organizer permissions.");
      }
    );

    const stopList = onSnapshot(
      collection(db, "organizers"),
      (snapshot) => {
        const items = snapshot.docs.map((item) => ({
          uid: item.id,
          ...item.data()
        }));

        items.sort((a, b) => {
          const rank = (item) =>
            item.role === "owner" ? 0 :
            item.role === "admin" ? 1 :
            item.status === "pending" ? 2 : 3;

          return rank(a) - rank(b) ||
            String(a.email || "").localeCompare(String(b.email || ""));
        });

        setOrganizers(items);
        setLoading(false);
      },
      (err) => {
        console.error("Unable to load organizers:", err);
        setError(
          "Unable to load organizers. Check your Firestore Security Rules and account permissions."
        );
        setLoading(false);
      }
    );

    return () => {
      stopCurrent();
      stopList();
    };
  }, []);

  useEffect(() => {
    const closeMenu = (event) => {
      if (event.key === "Escape") setOpenMenuUid("");
    };
    window.addEventListener("keydown", closeMenu);
    return () => window.removeEventListener("keydown", closeMenu);
  }, []);

  useEffect(() => {
    if (!confirmDeleteItem) return undefined;
    const closeConfirmation = (event) => {
      if (event.key === "Escape" && !deletingUid) setConfirmDeleteItem(null);
    };
    document.addEventListener("keydown", closeConfirmation);
    return () => document.removeEventListener("keydown", closeConfirmation);
  }, [confirmDeleteItem, deletingUid]);

  // The dropdown is portaled to document.body so parent cards, grids, and
  // containers cannot clip it or force it to appear inside the card layout.
  useEffect(() => {
    if (!openMenuUid) return undefined;

    const closeOnOutsideClick = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".om-menu-portal") || target.closest(".om-menu-trigger")) return;
      setOpenMenuUid("");
    };
    const closeOnViewportChange = () => setOpenMenuUid("");

    document.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [openMenuUid]);

  const toggleOrganizerMenu = (event, item, editable, deletable) => {
    if (openMenuUid === item.uid) {
      setOpenMenuUid("");
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = Math.min(255, window.innerWidth - 24);
    // This menu contains two actions and may also contain a protection hint.
    const estimatedMenuHeight = (editable ? 44 : 48) + 44 + (!deletable ? 42 : 0) + 22;
    const left = Math.max(12, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 12));
    let top = rect.bottom + 8;
    if (top + estimatedMenuHeight > window.innerHeight - 12) {
      top = rect.top - estimatedMenuHeight - 8;
    }
    top = Math.max(12, Math.min(top, window.innerHeight - estimatedMenuHeight - 12));

    setMenuPosition({ top, left });
    setOpenMenuUid(item.uid);
  };

  const isOwner = currentOrganizer?.role === "owner";
  const canManage =
    currentOrganizer?.status === "approved" &&
    (isOwner || currentOrganizer?.role === "admin" ||
      currentOrganizer?.permissions?.manageOrganizers === true);

  const canApprove =
    currentOrganizer?.status === "approved" &&
    (isOwner || currentOrganizer?.permissions?.approveOrganizers === true ||
      currentOrganizer?.role === "admin");

  const canEditTarget = (target) =>
    canManage && target.uid !== currentOrganizer?.uid && target.role !== "owner";

  // Any authorized organizer manager can delete another non-owner profile,
  // including admin profiles. The signed-in account and permanent owner stay protected.
  // Firestore rules enforce the same restriction server-side.
  const canDeleteTarget = (target) =>
    canManage && target.uid !== currentOrganizer?.uid && target.role !== "owner";

  const roleLabel = (item) => {
    if (item.role === "owner") return "Permanent owner";
    if (item.role === "admin") return "Admin";
    return "Organizer";
  };

  const statusLabel = (item) => {
    if (item.status === "approved") return "Approved";
    if (item.status === "rejected") return "Rejected";
    return "Pending approval";
  };

  const permissionLabels = (item) => {
    if (item.role === "owner") return "All permissions";
    if (item.role === "admin") return "Admin permissions";
    const permissions = item.permissions || {};
    const labels = PERMISSIONS.filter(({ key }) => permissions[key] === true)
      .map(({ label }) => label);
    return labels.length ? labels.join(", ") : "No permissions assigned";
  };

  const createDraft = (item) => ({
    role: item.role === "admin" ? "admin" : "organizer",
    permissions: {
      ...EMPTY_PERMISSIONS,
      ...(item.permissions || {})
    }
  });

  const getDraft = (item) => ({
    ...createDraft(item),
    ...(drafts[item.uid] || {}),
    permissions: {
      ...createDraft(item).permissions,
      ...(drafts[item.uid]?.permissions || {})
    }
  });

  const startEditing = (item) => {
    if (!canEditTarget(item)) {
      setError("You do not have permission to modify this account.");
      setOpenMenuUid("");
      return;
    }
    setError("");
    setNotice("");
    setDrafts((previous) => ({ ...previous, [item.uid]: createDraft(item) }));
    setEditingUid(item.uid);
    setOpenMenuUid("");
  };

  const cancelEditing = (uid) => {
    setDrafts((previous) => {
      const next = { ...previous };
      delete next[uid];
      return next;
    });
    setEditingUid("");
    setOpenMenuUid("");
    setError("");
  };

  const updateDraft = (uid, changes) => {
    setDrafts((previous) => ({
      ...previous,
      [uid]: {
        ...(previous[uid] || {}),
        ...changes,
        ...(changes.permissions
          ? { permissions: { ...(previous[uid]?.permissions || EMPTY_PERMISSIONS), ...changes.permissions } }
          : {})
      }
    }));
  };

  const saveOrganizer = async (item, changes, successMessage) => {
    if (!canEditTarget(item)) {
      setError("You do not have permission to modify this account.");
      return false;
    }

    setSavingUid(item.uid);
    setError("");
    setNotice("");

    try {
      await updateDoc(doc(db, "organizers", item.uid), {
        ...changes,
        updatedAt: new Date()
      });
      setDrafts((previous) => {
        const next = { ...previous };
        delete next[item.uid];
        return next;
      });
      if (editingUid === item.uid) setEditingUid("");
      setNotice(successMessage || "Organizer details updated successfully.");
      return true;
    } catch (err) {
      console.error("Organizer update failed:", err);
      setError(
        err.code === "permission-denied"
          ? "Permission denied by Firestore Security Rules. Verify the role and permission rules."
          : "Unable to save changes. Please try again."
      );
      return false;
    } finally {
      setSavingUid("");
    }
  };

  const approveOrganizer = (item) => {
    if (!canApprove || !canEditTarget(item)) {
      setError("You do not have permission to approve this account.");
      return;
    }
    void saveOrganizer(item, {
      status: "approved",
      reviewedBy: auth.currentUser?.uid || ""
    }, "Organizer application approved.");
  };

  const rejectOrganizer = (item) => {
    if (!canApprove || !canEditTarget(item)) {
      setError("You do not have permission to reject this account.");
      return;
    }
    void saveOrganizer(item, {
      status: "rejected",
      reviewedBy: auth.currentUser?.uid || ""
    }, "Organizer application rejected.");
  };

  const savePermissions = async (item) => {
    const draft = getDraft(item);
    if (draft.role !== item.role && !isOwner) {
      setError("Only the permanent owner can change another account's role.");
      return;
    }
    await saveOrganizer(item, {
      role: draft.role,
      permissions: { ...EMPTY_PERMISSIONS, ...draft.permissions }
    }, "Role and permissions saved.");
  };

  const requestDeleteOrganizer = (item) => {
    setOpenMenuUid("");
    if (!canDeleteTarget(item)) {
      setError("You do not have permission to delete this organizer account.");
      return;
    }
    setError("");
    setConfirmDeleteItem(item);
  };

  const deleteOrganizer = async (item) => {
    if (!item) return;
    if (!canDeleteTarget(item)) {
      setError("You do not have permission to delete this organizer account.");
      setConfirmDeleteItem(null);
      return;
    }

    setDeletingUid(item.uid);
    setError("");
    setNotice("");
    try {
      await deleteDoc(doc(db, "organizers", item.uid));
      setConfirmDeleteItem(null);
      setDrafts((previous) => {
        const next = { ...previous };
        delete next[item.uid];
        return next;
      });
      if (editingUid === item.uid) setEditingUid("");
      setNotice(`Organizer profile ${item.email ? `for ${item.email} ` : ""}was deleted.`);
    } catch (err) {
      console.error("Organizer deletion failed:", err);
      setConfirmDeleteItem(null);
      setError(
        err.code === "permission-denied"
          ? "Firestore blocked deletion. Update the organizers delete rule as described in the included README, then publish the rules."
          : "Unable to delete organizer profile. Please try again."
      );
    } finally {
      setDeletingUid("");
    }
  };

  return (
    <section className="om-page">
      <div className="om-topbar">
        <button type="button" className="om-back-button" onClick={() => navigate("/admin")}>
          <ArrowLeft size={17} />
          <span>Back to dashboard</span>
        </button>
        <div className="om-account-chip">
          <span className="om-account-dot" />
          Organizer management
        </div>
      </div>

      <header className="om-hero">
        <div className="om-hero-icon"><Users size={27} /></div>
        <div className="om-hero-copy">
          <span className="om-eyebrow">ACCESS CONTROL CENTER</span>
          <h2>Organizers &amp; admins</h2>
          <p>Review applications, manage roles, and control access to your campus event portal.</p>
          {currentOrganizer && (
            <div className="om-signed-in">
              Signed in as <strong>{currentOrganizer.email || auth.currentUser?.email}</strong>
              <span className="om-signed-separator">·</span>
              {roleLabel(currentOrganizer)}
            </div>
          )}
        </div>
        <div className="om-total-card">
          <strong>{organizers.length}</strong>
          <span>Total accounts</span>
        </div>
      </header>

      {!canManage && currentOrganizer && (
        <div className="om-alert om-alert-error" role="alert">
          <LockKeyhole size={18} />
          <span>Your account does not have permission to manage organizer accounts.</span>
        </div>
      )}
      {error && (
        <div className="om-alert om-alert-error" role="alert">
          <AlertCircle size={18} /> <span>{error}</span>
          <button type="button" aria-label="Dismiss error" onClick={() => setError("")}><X size={16} /></button>
        </div>
      )}
      {notice && (
        <div className="om-alert om-alert-success" role="status">
          <CheckCircle2 size={18} /> <span>{notice}</span>
          <button type="button" aria-label="Dismiss message" onClick={() => setNotice("")}><X size={16} /></button>
        </div>
      )}

      {loading ? (
        <div className="om-loading"><span className="om-spinner" /> Loading organizer accounts…</div>
      ) : organizers.length === 0 ? (
        <div className="om-empty">
          <div className="om-empty-icon"><Users size={28} /></div>
          <h3>No organizer accounts yet</h3>
          <p>Organizer accounts will appear here after their Firestore profile is created.</p>
        </div>
      ) : (
        <div className="om-list">
          {organizers.map((item) => {
            const draft = getDraft(item);
            const editable = canEditTarget(item);
            const deletable = canDeleteTarget(item);
            const isEditing = editingUid === item.uid;
            const pending = item.status === "pending" || !item.status;
            const isBusy = savingUid === item.uid || deletingUid === item.uid;
            const title = item.displayName || item.name || item.email || "Unnamed organizer";

            return (
              <article className={`om-organizer-card ${item.role === "owner" ? "om-card-owner" : ""} ${isEditing ? "om-card-editing" : ""}`} key={item.uid}>
                <div className={`om-avatar ${item.role === "owner" || item.role === "admin" ? "om-avatar-admin" : ""}`}>
                  {item.role === "owner" || item.role === "admin" ? <ShieldCheck size={23} /> : <Users size={23} />}
                </div>

                <div className="om-card-main">
                  <div className="om-card-heading">
                    <div className="om-identity">
                      <div className="om-name-row">
                        <h3>{title}</h3>
                        {item.role === "owner" && <span className="om-owner-tag"><LockKeyhole size={12} /> Protected</span>}
                      </div>
                      <span className="om-email">{item.email || "Email unavailable"}</span>
                    </div>
                    <div className="om-card-actions">
                      <span className={`om-status ${item.status === "approved" ? "is-approved" : item.status === "rejected" ? "is-rejected" : "is-pending"}`}>
                        {item.status === "approved" ? <CheckCircle2 size={14} /> : item.status === "rejected" ? <XCircle size={14} /> : <Clock3 size={14} />}
                        {statusLabel(item)}
                      </span>
                      <div className="om-menu-wrap">
                        <button
                          type="button"
                          className={`om-menu-trigger ${openMenuUid === item.uid ? "is-open" : ""}`}
                          aria-label={`Actions for ${title}`}
                          aria-haspopup="menu"
                          aria-expanded={openMenuUid === item.uid}
                          onClick={(event) => toggleOrganizerMenu(event, item, editable, deletable)}
                        >
                          <MoreVertical size={20} />
                        </button>
                        {openMenuUid === item.uid && typeof document !== "undefined" && createPortal(
                          <div
                            className="om-menu om-menu-portal"
                            role="menu"
                            style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }}
                          >
                            {editable ? (
                              <button type="button" role="menuitem" onClick={() => startEditing(item)}>
                                <Pencil size={16} /> Edit role &amp; permissions
                              </button>
                            ) : (
                              <div className="om-menu-protected"><LockKeyhole size={15} /> Account is protected</div>
                            )}
                            <button
                              type="button"
                              role="menuitem"
                              className={`om-menu-danger ${!deletable ? "is-disabled" : ""}`}
                              disabled={!deletable}
                              title={
                                item.role === "owner"
                                  ? "The permanent owner account is protected."
                                  : item.uid === currentOrganizer?.uid
                                    ? "You cannot delete your own organizer profile."
                                    : !canManage
                                      ? "Your account does not have organizer-management permission."
                                      : "You do not have permission to delete this account."
                              }
                              onClick={() => { if (deletable) requestDeleteOrganizer(item); }}
                            >
                              <Trash2 size={16} /> Delete organizer
                            </button>
                            {!deletable && (
                              <div className="om-menu-hint">
                                {item.role === "owner"
                                  ? "The permanent owner cannot be deleted."
                                  : item.uid === currentOrganizer?.uid
                                    ? "You cannot delete your own profile."
                                    : !canManage
                                      ? "Your account does not have organizer-management permission."
                                      : "Your account does not have delete permission."}
                              </div>
                            )}
                          </div>,
                          document.body
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="om-meta-row">
                    <span className={`om-role-pill ${item.role === "admin" ? "is-admin" : item.role === "owner" ? "is-owner" : "is-organizer"}`}>{roleLabel(item)}</span>
                    <span className="om-meta-divider" />
                    <span className="om-permission-summary"><strong>Access:</strong> {permissionLabels(item)}</span>
                  </div>

                  {item.role === "owner" && (
                    <div className="om-owner-note"><ShieldCheck size={15} /> Permanent owner account has full access and cannot be edited or deleted here.</div>
                  )}

                  {editable && pending && canApprove && !isEditing && (
                    <div className="om-review-actions">
                      <button type="button" className="om-button om-button-primary" disabled={isBusy} onClick={() => approveOrganizer(item)}>
                        <CheckCircle2 size={16} /> Approve application
                      </button>
                      <button type="button" className="om-button om-button-quiet" disabled={isBusy} onClick={() => rejectOrganizer(item)}>
                        <XCircle size={16} /> Reject
                      </button>
                    </div>
                  )}

                  {isEditing && (
                    <div className="om-edit-panel">
                      <div className="om-edit-title-row">
                        <div>
                          <span className="om-eyebrow">ACCOUNT SETTINGS</span>
                          <h4>Edit role &amp; permissions</h4>
                        </div>
                        <button type="button" className="om-icon-button" aria-label="Cancel editing" onClick={() => cancelEditing(item.uid)} disabled={isBusy}><X size={18} /></button>
                      </div>

                      <div className="om-role-field">
                        <label htmlFor={`om-role-${item.uid}`}>Account role</label>
                        <select
                          id={`om-role-${item.uid}`}
                          value={draft.role}
                          disabled={!isOwner || isBusy}
                          onChange={(event) => updateDraft(item.uid, { role: event.target.value })}
                        >
                          <option value="organizer">Organizer</option>
                          <option value="admin">Admin</option>
                        </select>
                        {!isOwner && <span className="om-field-hint">Only the permanent owner can change account roles. You can still edit permitted access below.</span>}
                      </div>

                      <div className="om-permissions-heading">
                        <div><h5>Assign permissions</h5><p>Choose what this account can access.</p></div>
                        <span>{PERMISSIONS.filter(({ key }) => draft.permissions[key]).length} of {PERMISSIONS.length} enabled</span>
                      </div>

                      <div className="om-permission-grid">
                        {PERMISSIONS.map(({ key, label, description }) => (
                          <label key={key} className={`om-permission-option ${draft.permissions[key] ? "is-checked" : ""}`}>
                            <input
                              type="checkbox"
                              checked={draft.permissions[key] === true}
                              disabled={isBusy}
                              onChange={(event) => updateDraft(item.uid, {
                                permissions: { [key]: event.target.checked }
                              })}
                            />
                            <span className="om-custom-checkbox">{draft.permissions[key] && <Check size={13} />}</span>
                            <span className="om-permission-text"><strong>{label}</strong><small>{description}</small></span>
                          </label>
                        ))}
                      </div>

                      <div className="om-edit-actions">
                        <button type="button" className="om-button om-button-quiet" onClick={() => cancelEditing(item.uid)} disabled={isBusy}>Cancel</button>
                        <button type="button" className="om-button om-button-primary" onClick={() => void savePermissions(item)} disabled={isBusy}>
                          <Save size={16} /> {savingUid === item.uid ? "Saving changes…" : "Save changes"}
                        </button>
                      </div>
                    </div>
                  )}

                  {isBusy && deletingUid === item.uid && <div className="om-inline-progress"><span className="om-spinner" /> Removing organizer profile…</div>}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <footer className="om-footer-note"><LockKeyhole size={14} /> Role and delete actions are protected by Firestore Security Rules; UI checks alone are not security enforcement.</footer>

      {confirmDeleteItem && typeof document !== "undefined" && createPortal(
        <div
          className="om-confirm-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deletingUid) setConfirmDeleteItem(null);
          }}
        >
          <section
            className="om-confirm-card"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="om-confirm-delete-title"
            aria-describedby="om-confirm-delete-description"
          >
            <div className="om-confirm-icon"><Trash2 size={23} /></div>
            <button
              type="button"
              className="om-confirm-close"
              aria-label="Close delete confirmation"
              onClick={() => setConfirmDeleteItem(null)}
              disabled={Boolean(deletingUid)}
            >
              <X size={18} />
            </button>
            <span className="om-confirm-eyebrow">CONFIRM ACTION</span>
            <h3 id="om-confirm-delete-title">Delete organizer?</h3>
            <p id="om-confirm-delete-description">
              Are you sure you want to delete <strong>{confirmDeleteItem.displayName || confirmDeleteItem.name || confirmDeleteItem.email || "this organizer"}</strong>?
              Their organizer profile will be removed from Firestore. Their Firebase Authentication sign-in account will not be deleted.
            </p>
            <div className="om-confirm-account">
              <span className="om-confirm-account-avatar"><Users size={19} /></span>
              <span><strong>{confirmDeleteItem.displayName || confirmDeleteItem.name || "Organizer account"}</strong><small>{confirmDeleteItem.email || "Email unavailable"}</small></span>
            </div>
            <div className="om-confirm-actions">
              <button
                type="button"
                className="om-button om-button-quiet"
                onClick={() => setConfirmDeleteItem(null)}
                disabled={Boolean(deletingUid)}
              >Cancel</button>
              <button
                type="button"
                className="om-button om-button-danger"
                onClick={() => void deleteOrganizer(confirmDeleteItem)}
                disabled={Boolean(deletingUid)}
              >
                {deletingUid === confirmDeleteItem.uid ? <><span className="om-spinner om-spinner-danger" /> Deleting…</> : <><Trash2 size={16} /> Delete organizer</>}
              </button>
            </div>
          </section>
        </div>,
        document.body
      )}
    </section>
  );
}
