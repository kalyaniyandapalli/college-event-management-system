const admin = require("firebase-admin");

const {
  onCall,
  HttpsError,
} = require("firebase-functions/v2/https");

const {
  onDocumentCreated,
  onDocumentWritten,
} = require("firebase-functions/v2/firestore");

const {
  defineSecret,
  defineString,
} = require("firebase-functions/params");

const { Resend } = require("resend");

admin.initializeApp();

const db = admin.firestore();

const resendApiKey = defineSecret("RESEND_API_KEY");

const OWNER_EMAIL = defineString("OWNER_EMAIL");
const TEMP_ADMIN_EMAIL = defineString("TEMP_ADMIN_EMAIL");
const EVENTS_EMAIL_FROM = defineString("EVENTS_EMAIL_FROM");

const REGION = "asia-south1";

const AVAILABLE_PERMISSIONS = [
  "manageEvents",
  "manageRegistrations",
  "manageContent",
  "manageOrganizers",
  "approveOrganizers",
];

const ALL_PERMISSIONS = [...AVAILABLE_PERMISSIONS];


// --------------------------------------------------
// Shared helpers
// --------------------------------------------------

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function requireAuth(request) {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Please sign in first."
    );
  }

  return request.auth;
}

function hasPermission(auth, permission) {
  if (!auth) return false;

  if (auth.token.role === "owner") {
    return true;
  }

  return (
    Array.isArray(auth.token.permissions) &&
    auth.token.permissions.includes(permission)
  );
}

function requirePermission(request, permission) {
  const auth = requireAuth(request);

  if (!hasPermission(auth, permission)) {
    throw new HttpsError(
      "permission-denied",
      "You do not have permission to perform this action."
    );
  }

  return auth;
}

function configuredOwnerEmail() {
  return normalizeEmail(OWNER_EMAIL.value());
}

function configuredTempAdminEmail() {
  return normalizeEmail(TEMP_ADMIN_EMAIL.value());
}

async function sendEmail({ to, subject, html }) {
  const from = EVENTS_EMAIL_FROM.value();

  if (!from) {
    console.error("EVENTS_EMAIL_FROM is not configured.");
    return;
  }

  const resend = new Resend(resendApiKey.value());

  const { error } = await resend.emails.send({
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
  });

  if (error) {
    console.error("Email delivery failed:", error);
    throw new HttpsError(
      "internal",
      "Email could not be sent."
    );
  }
}

async function setUserClaims(uid, role, permissions = [], approved = false) {
  const userRecord = await admin.auth().getUser(uid);

  // Preserve unrelated claims used by other parts of the application.
  const existingClaims = userRecord.customClaims || {};

  await admin.auth().setCustomUserClaims(uid, {
    ...existingClaims,
    role,
    organizer: role === "owner" || role === "admin" || role === "organizer",
    approved,
    permissions:
      role === "owner"
        ? ALL_PERMISSIONS
        : permissions.filter((item) =>
            AVAILABLE_PERMISSIONS.includes(item)
          ),
  });
}

async function getActorEmail(request) {
  const auth = requireAuth(request);

  const userRecord = await admin.auth().getUser(auth.uid);

  return normalizeEmail(userRecord.email);
}

async function ensureCanManageTarget(request, targetUid) {
  const auth = requirePermission(request, "manageOrganizers");

  if (!targetUid || typeof targetUid !== "string") {
    throw new HttpsError(
      "invalid-argument",
      "A valid target user ID is required."
    );
  }

  if (targetUid === auth.uid) {
    throw new HttpsError(
      "failed-precondition",
      "You cannot change your own role or permissions here."
    );
  }

  const target = await admin.auth().getUser(targetUid);

  const targetEmail = normalizeEmail(target.email);

  if (targetEmail === configuredOwnerEmail()) {
    throw new HttpsError(
      "permission-denied",
      "The permanent owner cannot be changed or removed."
    );
  }

  return { auth, target };
}


// --------------------------------------------------
// 1. Initialize configured admin account
//
// Call after signing in with the email configured in
// OWNER_EMAIL or TEMP_ADMIN_EMAIL.
//
// This does not allow arbitrary users to become admins.
// --------------------------------------------------

exports.initializeConfiguredAdmin = onCall(
  { region: REGION },
  async (request) => {
    const auth = requireAuth(request);
    const email = await getActorEmail(request);

    const ownerEmail = configuredOwnerEmail();
    const tempAdminEmail = configuredTempAdminEmail();

    if (!ownerEmail || !tempAdminEmail) {
      throw new HttpsError(
        "failed-precondition",
        "Configure OWNER_EMAIL and TEMP_ADMIN_EMAIL first."
      );
    }

    if (email === ownerEmail) {
      const ownerRef = db.collection("systemConfig").doc("owner");
      const ownerSnapshot = await ownerRef.get();

      if (ownerSnapshot.exists) {
        const storedOwnerUid = ownerSnapshot.data().uid;

        if (storedOwnerUid !== auth.uid) {
          throw new HttpsError(
            "permission-denied",
            "The permanent owner has already been initialized."
          );
        }
      } else {
        // A transaction prevents two users from claiming ownership
        // simultaneously.
        await db.runTransaction(async (transaction) => {
          const freshSnapshot = await transaction.get(ownerRef);

          if (
            freshSnapshot.exists &&
            freshSnapshot.data().uid !== auth.uid
          ) {
            throw new HttpsError(
              "permission-denied",
              "The permanent owner has already been initialized."
            );
          }

          transaction.set(ownerRef, {
            uid: auth.uid,
            email,
            initializedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        });
      }

      await setUserClaims(auth.uid, "owner", ALL_PERMISSIONS, true);

      await db.collection("users").doc(auth.uid).set(
        {
          email,
          role: "owner",
          approved: true,
          permissions: ALL_PERMISSIONS,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return { success: true, role: "owner" };
    }

    if (email === tempAdminEmail) {
      const ownerSnapshot = await db
        .collection("systemConfig")
        .doc("owner")
        .get();

      if (!ownerSnapshot.exists) {
        throw new HttpsError(
          "failed-precondition",
          "Initialize the permanent owner account first."
        );
      }

      await setUserClaims(
        auth.uid,
        "admin",
        ALL_PERMISSIONS,
        true
      );

      await db.collection("users").doc(auth.uid).set(
        {
          email,
          role: "admin",
          approved: true,
          permissions: ALL_PERMISSIONS,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return { success: true, role: "admin" };
    }

    throw new HttpsError(
      "permission-denied",
      "This email is not configured as an initial administrator."
    );
  }
);


// --------------------------------------------------
// 2. Organizer application
// --------------------------------------------------

exports.applyAsOrganizer = onCall(
  { region: REGION },
  async (request) => {
    const auth = requireAuth(request);
    const userRecord = await admin.auth().getUser(auth.uid);

    if (!userRecord.email) {
      throw new HttpsError(
        "failed-precondition",
        "Your account must have an email address."
      );
    }

    const email = normalizeEmail(userRecord.email);

    const userRef = db.collection("users").doc(auth.uid);
    const userSnapshot = await userRef.get();

    if (
      userSnapshot.exists &&
      ["owner", "admin"].includes(userSnapshot.data().role)
    ) {
      throw new HttpsError(
        "failed-precondition",
        "This account already has an administrator role."
      );
    }

    const existingApplication = await db
      .collection("organizerApplications")
      .where("uid", "==", auth.uid)
      .where("status", "==", "pending")
      .limit(1)
      .get();

    if (!existingApplication.empty) {
      throw new HttpsError(
        "already-exists",
        "You already have a pending organizer application."
      );
    }

    const applicationRef = db
      .collection("organizerApplications")
      .doc();

    await applicationRef.set({
      uid: auth.uid,
      email,
      displayName: userRecord.displayName || "",
      status: "pending",
      requestedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await userRef.set(
      {
        email,
        role: "applicant",
        approved: false,
        permissions: [],
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      success: true,
      applicationId: applicationRef.id,
      status: "pending",
    };
  }
);


// --------------------------------------------------
// 3. Notify configured admins of organizer applications
// --------------------------------------------------

exports.notifyOrganizerApplication = onDocumentCreated(
  {
    document: "organizerApplications/{applicationId}",
    region: REGION,
    secrets: [resendApiKey],
  },
  async (event) => {
    const application = event.data?.data();

    if (!application || application.status !== "pending") {
      return;
    }

    const ownerEmail = configuredOwnerEmail();
    const tempAdminEmail = configuredTempAdminEmail();

    const recipients = [
      ...new Set(
        [ownerEmail, tempAdminEmail].filter(Boolean)
      ),
    ];

    if (recipients.length === 0) {
      console.error("No administrator email addresses configured.");
      return;
    }

    await sendEmail({
      to: recipients,
      subject: "Organizer approval required",
      html: `
        <div style="font-family:Arial,sans-serif;color:#222">
          <h2>New organizer application</h2>
          <p>A new organizer application is waiting for review.</p>
          <p><b>Email:</b> ${escapeHtml(application.email)}</p>
          <p><b>Applicant UID:</b> ${escapeHtml(application.uid)}</p>
          <p>Sign in to the College Events Management admin panel to review it.</p>
        </div>
      `,
    });
  }
);


// --------------------------------------------------
// 4. Approve or reject an organizer application
// --------------------------------------------------

exports.reviewOrganizerApplication = onCall(
  { region: REGION },
  async (request) => {
    requirePermission(request, "approveOrganizers");

    const { applicationId, decision, permissions = [] } =
      request.data || {};

    if (
      typeof applicationId !== "string" ||
      !["approve", "reject"].includes(decision)
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Provide a valid applicationId and decision."
      );
    }

    if (
      !Array.isArray(permissions) ||
      permissions.some(
        (permission) => !AVAILABLE_PERMISSIONS.includes(permission)
      )
    ) {
      throw new HttpsError(
        "invalid-argument",
        "One or more permissions are invalid."
      );
    }

    const applicationRef = db
      .collection("organizerApplications")
      .doc(applicationId);

    const applicationSnapshot = await applicationRef.get();

    if (!applicationSnapshot.exists) {
      throw new HttpsError(
        "not-found",
        "Organizer application not found."
      );
    }

    const application = applicationSnapshot.data();

    if (application.status !== "pending") {
      throw new HttpsError(
        "failed-precondition",
        "This application has already been reviewed."
      );
    }

    if (decision === "reject") {
      await applicationRef.update({
        status: "rejected",
        reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await db.collection("users").doc(application.uid).set(
        {
          role: "applicant",
          approved: false,
          permissions: [],
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await setUserClaims(application.uid, "applicant", [], false);

      return { success: true, status: "rejected" };
    }

    await setUserClaims(
      application.uid,
      "organizer",
      permissions,
      true
    );

    await db.collection("users").doc(application.uid).set(
      {
        email: application.email,
        role: "organizer",
        approved: true,
        permissions,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await applicationRef.update({
      status: "approved",
      permissions,
      reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true, status: "approved", permissions };
  }
);


// --------------------------------------------------
// 5. Grant or revoke organizer permissions
// --------------------------------------------------

exports.setOrganizerPermissions = onCall(
  { region: REGION },
  async (request) => {
    const { targetUid, permissions, approved = true } =
      request.data || {};

    await ensureCanManageTarget(request, targetUid);

    if (
      !Array.isArray(permissions) ||
      permissions.some(
        (permission) => !AVAILABLE_PERMISSIONS.includes(permission)
      )
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Invalid permissions list."
      );
    }

    if (typeof approved !== "boolean") {
      throw new HttpsError(
        "invalid-argument",
        "approved must be true or false."
      );
    }

    const target = await admin.auth().getUser(targetUid);
    const targetEmail = normalizeEmail(target.email);

    if (
      targetEmail === configuredOwnerEmail() ||
      targetEmail === configuredTempAdminEmail()
    ) {
      throw new HttpsError(
        "permission-denied",
        "Initial administrator accounts cannot be changed here."
      );
    }

    const role = approved ? "organizer" : "applicant";
    const finalPermissions = approved ? permissions : [];

    await setUserClaims(
      targetUid,
      role,
      finalPermissions,
      approved
    );

    await db.collection("users").doc(targetUid).set(
      {
        email: target.email || "",
        role,
        approved,
        permissions: finalPermissions,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      success: true,
      role,
      approved,
      permissions: finalPermissions,
    };
  }
);


// --------------------------------------------------
// 6. Revoke a non-owner organizer's access
// --------------------------------------------------

exports.revokeOrganizerAccess = onCall(
  { region: REGION },
  async (request) => {
    const { targetUid } = request.data || {};

    await ensureCanManageTarget(request, targetUid);

    const target = await admin.auth().getUser(targetUid);
    const targetEmail = normalizeEmail(target.email);

    if (
      targetEmail === configuredOwnerEmail() ||
      targetEmail === configuredTempAdminEmail()
    ) {
      throw new HttpsError(
        "permission-denied",
        "Configured administrator accounts cannot be revoked here."
      );
    }

    await setUserClaims(targetUid, "applicant", [], false);

    await db.collection("users").doc(targetUid).set(
      {
        role: "applicant",
        approved: false,
        permissions: [],
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { success: true, accessRevoked: true };
  }
);


// --------------------------------------------------
// 7. Remove the temporary admin role
//
// Only the permanent owner can do this.
// --------------------------------------------------

exports.revokeTemporaryAdmin = onCall(
  { region: REGION },
  async (request) => {
    const auth = requireAuth(request);

    if (auth.token.role !== "owner") {
      throw new HttpsError(
        "permission-denied",
        "Only the permanent owner can revoke the temporary admin."
      );
    }

    const ownerSnapshot = await db
      .collection("systemConfig")
      .doc("owner")
      .get();

    if (!ownerSnapshot.exists || ownerSnapshot.data().uid !== auth.uid) {
      throw new HttpsError(
        "permission-denied",
        "Permanent owner verification failed."
      );
    }

    const targetEmail = configuredTempAdminEmail();

    if (!targetEmail) {
      throw new HttpsError(
        "failed-precondition",
        "TEMP_ADMIN_EMAIL is not configured."
      );
    }

    let target;

    try {
      target = await admin.auth().getUserByEmail(targetEmail);
    } catch (error) {
      if (error.code === "auth/user-not-found") {
        return { success: true, alreadyRemoved: true };
      }

      throw error;
    }

    await setUserClaims(target.uid, "applicant", [], false);

    await db.collection("users").doc(target.uid).set(
      {
        role: "applicant",
        approved: false,
        permissions: [],
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return { success: true, accessRevoked: true };
  }
);


// --------------------------------------------------
// 8. Registration pass email — existing functionality
// --------------------------------------------------

exports.sendRegistrationPassEmail = onDocumentCreated(
  {
    document: "registrations/{registrationId}",
    secrets: [resendApiKey],
    region: REGION,
  },
  async (event) => {
    const registration = event.data?.data();

    if (
      !registration ||
      !registration.email ||
      !registration.passId
    ) {
      return;
    }

    const eventDoc = await db
      .collection("events")
      .doc(registration.eventId)
      .get();

    const eventInfo = eventDoc.exists ? eventDoc.data() : {};

    const eventTitle = escapeHtml(
      registration.eventTitle ||
      eventInfo.title ||
      "College Event"
    );

    const studentName = escapeHtml(registration.name || "Student");
    const date = escapeHtml(eventInfo.date || "To be announced");
    const time = escapeHtml(eventInfo.time || "To be announced");
    const venue = escapeHtml(eventInfo.venue || "To be announced");
    const passId = escapeHtml(registration.passId);

    await sendEmail({
      to: registration.email,
      subject: `Your event pass: ${
        eventInfo.title ||
        registration.eventTitle ||
        "College Event"
      }`,
      html: `
        <div style="background:#f8f4ff;padding:28px;font-family:Arial,sans-serif;color:#28213e">
          <div style="max-width:560px;margin:auto;background:#fff;border:2px solid #28213e;border-radius:18px;overflow:hidden">
            <div style="background:#28213e;color:#ffce80;padding:18px 22px;font-weight:bold;letter-spacing:1px">
              CAMPUS FEST · OFFICIAL PASS
            </div>
            <div style="padding:24px;background:#e9ddff">
              <p style="font-size:11px;letter-spacing:2px;font-weight:bold">
                REGISTRATION CONFIRMED
              </p>
              <h1 style="font-size:30px;margin:8px 0 12px">${eventTitle}</h1>
              <p>Hello ${studentName}, your registration is confirmed. Keep this email for your event details.</p>
              <div style="background:#ffffffcc;border-radius:12px;padding:16px;line-height:1.9">
                <b>Date:</b> ${date}<br/>
                <b>Time:</b> ${time}<br/>
                <b>Venue:</b> ${venue}<br/>
                <b>Pass ID:</b> ${passId}
              </div>
              <p style="font-size:12px">Please show your pass ID to the event organizer at check-in.</p>
            </div>
            <div style="padding:16px 22px;color:#776a89;font-size:12px">
              If you did not register for this event, contact your college event team.
            </div>
          </div>
        </div>
      `,
    });
  }
);


// --------------------------------------------------
// 9. Keep public homepage registration counters live
//
// totalRegistrations: number of confirmed registration records.
// totalParticipants: unique student UIDs with at least one
// confirmed registration.
//
// The homepage reads only publicStats/overview. No private
// registration records or personal details are made public.
// --------------------------------------------------

async function refreshPublicRegistrationStats() {
  const registrationsSnapshot = await db
    .collection("registrations")
    .get();

  let totalRegistrations = 0;
  const participantUids = new Set();

  registrationsSnapshot.forEach((document) => {
    const registration = document.data() || {};

    if (registration.status !== "confirmed") {
      return;
    }

    totalRegistrations += 1;

    if (typeof registration.uid === "string" && registration.uid.trim()) {
      participantUids.add(registration.uid.trim());
    }
  });

  await db.collection("publicStats").doc("overview").set(
    {
      totalRegistrations,
      totalParticipants: participantUids.size,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    totalRegistrations,
    totalParticipants: participantUids.size,
  };
}

exports.updatePublicRegistrationStats = onDocumentWritten(
  {
    document: "registrations/{registrationId}",
    region: REGION,
  },
  async () => {
    await refreshPublicRegistrationStats();
  }
);


// --------------------------------------------------
// 10. One-time/manual initialization of homepage counters
//
// Run after deploying if registrations already exist. This is
// also safe to call again to refresh the aggregate totals.
// Requires owner access or Manage Registrations permission.
// --------------------------------------------------

exports.initializePublicRegistrationStats = onCall(
  { region: REGION },
  async (request) => {
    const auth = requireAuth(request);

    if (
      auth.token.role !== "owner" &&
      !hasPermission(auth, "manageRegistrations")
    ) {
      throw new HttpsError(
        "permission-denied",
        "You need Manage Registrations permission to initialize public statistics."
      );
    }

    const stats = await refreshPublicRegistrationStats();

    return {
      success: true,
      ...stats,
    };
  }
);
