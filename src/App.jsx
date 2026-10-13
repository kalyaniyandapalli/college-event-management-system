import "./college-fest-logo-animation.css";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  setDoc,
  runTransaction
} from "firebase/firestore";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "firebase/auth";
import {
  AlertCircle,
  ArrowUpRight,
  CalendarDays,
  Clock3,
  MapPin,
  Search,
  Sparkles,
  Ticket,
  ShieldCheck,
  LayoutDashboard,
  Pencil,
  Trash2,
  Users,
  Download,
  Save,
  Mail,
  CheckCircle2,
  Megaphone,
  UsersRound,
  CalendarClock,
  GraduationCap,
  LogIn,
  UserPlus,
  Plus,
  Eye,
  EyeOff,
  X
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { auth, db, firebaseConfigured, storage } from "./firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { defaultSiteContent } from "./data";
import { defaultEvents, defaultAnnouncements } from "./fest-default-content";
import { downloadPassPdf } from "./pass";
import "./styles.css";
import "./college-theme.css";
import "./responsive-layout.css";
import "./festival-home.css";
import "./auth-organizers-effects.css";
import "./dashboard-ui-polish.css";
import "./campus-announcements-admin.css";
import "./public-festival-interactive.css";
import CollegeSplash from "./CollegeSplash";
import OrganizersManager from "./OrganizersManager";

const demoMode = import.meta.env.VITE_DEMO_MODE === "true";

const demoAdmin = {
  uid: "local-demo-organizer",
  email: "organizer@demo.local",
  displayName: "Demo Organizer"
};

const categories = ["All Events", "Technical", "Cultural", "Sports", "Workshop", "Creative"];

const PERMISSION_KEYS = [
  "manageEvents",
  "manageContent",
  "viewRegistrations",
  "manageMessages",
  "manageOrganizers",
  "approveOrganizers"
];

const collegeDefaultContent = {
  ...defaultSiteContent,
  collegeName: "Smt. B. Seetha Polytechnic",
  aboutTitle: "About Fest",
  aboutDescription:
    "At Smt. B. Seetha Polytechnic, campus life extends beyond the classroom. Student-focused technical, cultural, creative and community activities give learners opportunities to share ideas, showcase talent, build confidence and work together. Each event is a chance to learn, connect and create lasting campus memories. The fest website brings event discovery and registration together in one place.",
  contactEmail: "info@seethapoly.edu.in",
  heroEyebrow: "YOUR CAMPUS. YOUR MOMENT.",
  heroNote: "Good vibes. Great memories.",
  heroTitleLine1: "Make some",
  heroTitleLine2: "campus magic.",
  heroStat2Value: "∞",
  heroStat2Label: "Memories to make",
  heroStat3Value: "01",
  heroStat3Label: "Epic campus fest",
  heroArtTopSticker: "LET'S GO! ↗",
  heroArtWord1: "CAMPUS",
  heroArtWord2: "VIBES",
  heroArtCaption: "MAKE IT COUNT ★",
  heroArtYear: String(new Date().getFullYear()),
  heroArtBottomSticker: "GOOD TIMES ONLY ✷",
  heroArtworkUrl: "",
  collegeDescription:
    "Smt. B. Seetha Polytechnic brings students together through learning, creativity and campus activities. This events portal helps students discover activities, register for events and participate in college life.",
  collegeWebsiteUrl: "https://seethapoly.edu.in/",
  eventsEyebrow: "THE GOOD STUFF",
  eventsTitle: "Find your thing.",
  eventsDescription:
    "Big ideas, loud music and moments worth showing up for.",
  aboutExtraDescription:
    "From technical showcases and hands-on learning to cultural performances and creative competitions, campus events bring students together to collaborate, express themselves and celebrate their talents. The aim is to make every fest well-organized, inclusive and memorable for participants, volunteers and visitors.",
  contactIntro:
    "Use this form for event queries, registration support, accessibility requests or suggestions for upcoming campus activities.",
  campusLocation: "Smt. B. Seetha Polytechnic"
};

function makeId() {
  return "EVT-" + Math.random().toString(36).slice(2, 10).toUpperCase();
}

function formatDate(date) {
  if (!date) return "Date to be announced";

  const parsedDate = new Date(date + "T12:00:00");

  if (Number.isNaN(parsedDate.getTime())) {
    return "Date to be announced";
  }

  return parsedDate.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function getEventTimestamp(event) {
  if (!event?.date) return Number.NaN;

  try {
    if (typeof event.date?.toDate === "function") {
      return event.date.toDate().getTime();
    }

    const dateText = String(event.date).trim();
    const timeText = String(event.time || "").trim();
    let parsed = new Date(dateText);

    if (/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
      parsed = new Date(`${dateText}T${timeText || "23:59"}`);
      if (Number.isNaN(parsed.getTime())) {
        parsed = new Date(`${dateText} ${timeText || "23:59"}`);
      }
    } else if (timeText) {
      const withTime = new Date(`${dateText} ${timeText}`);
      if (!Number.isNaN(withTime.getTime())) parsed = withTime;
    }

    return parsed.getTime();
  } catch {
    return Number.NaN;
  }
}

function timestampForSort(value) {
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  const parsed = new Date(value || 0).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function hasRoleAccess(profile) {
  return (
    profile?.status === "approved" &&
    ["owner", "admin", "organizer"].includes(profile?.role)
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [organizerProfile, setOrganizerProfile] = useState(null);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [events, setEvents] = useState(defaultEvents);
  const [registrations, setRegistrations] = useState([]);
  const [contactMessages, setContactMessages] = useState([]);
  const [siteContent, setSiteContent] = useState(collegeDefaultContent);
  const [publicStats, setPublicStats] = useState({});
  const [announcements, setAnnouncements] = useState([]);
  const [busy, setBusy] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();

  const isDemo = demoMode || !firebaseConfigured;

  // Authentication and organizer permissions
  useEffect(() => {
    if (isDemo) return;

    let stopProfile = null;

    const stopAuth = onAuthStateChanged(auth, (nextUser) => {
      if (stopProfile) {
        stopProfile();
        stopProfile = null;
      }

      setUser(nextUser);
      setOrganizerProfile(null);
      setIsOrganizer(false);

      if (!nextUser) return;

      stopProfile = onSnapshot(
        doc(db, "organizers", nextUser.uid),
        (snapshot) => {
          const profile = snapshot.exists()
            ? { uid: nextUser.uid, ...snapshot.data() }
            : null;

          setOrganizerProfile(profile);

          const authorized =
            Boolean(nextUser.emailVerified) && hasRoleAccess(profile);

          setIsOrganizer(authorized);
        },
        (error) => {
          console.error("Unable to load organizer permissions:", error);
          setOrganizerProfile(null);
          setIsOrganizer(false);
        }
      );
    });

    return () => {
      stopAuth();
      if (stopProfile) stopProfile();
    };
  }, [isDemo]);

  // Load events and website content.
  // If the public Firestore events query is empty, display sample events.
  useEffect(() => {
    if (isDemo) {
      try {
        const savedEvents = localStorage.getItem("fest-demo-events");
        const savedContent = localStorage.getItem("fest-demo-content");
        const savedRegs = localStorage.getItem("fest-demo-registrations");
        const savedMessages = localStorage.getItem(
          "fest-demo-contact-messages"
        );

        if (savedEvents) {
          const parsedEvents = JSON.parse(savedEvents);

          // Restore sample events if the saved demo event list is empty.
          setEvents(
            Array.isArray(parsedEvents) && parsedEvents.length > 0
              ? parsedEvents
              : defaultEvents
          );
        } else {
          setEvents(defaultEvents);
        }

        if (savedContent) {
          setSiteContent({
            ...collegeDefaultContent,
            ...JSON.parse(savedContent)
          });
        }

        if (savedRegs) setRegistrations(JSON.parse(savedRegs));
        if (savedMessages) setContactMessages(JSON.parse(savedMessages));
      } catch (error) {
        console.error("Unable to load local demo data:", error);
        setEvents(defaultEvents);
      }

      return;
    }

    // Only users who can manage events may query unpublished event drafts.
    // Other signed-in users use the same published-only query as the public homepage.
    const canReadAllEvents = Boolean(
      isOrganizer &&
      organizerProfile &&
      (["owner", "admin"].includes(organizerProfile.role) ||
        organizerProfile.permissions?.manageEvents === true)
    );

    const eventsQuery = canReadAllEvents
      ? collection(db, "events")
      : query(
          collection(db, "events"),
          where("published", "==", true)
        );

    const stopEvents = onSnapshot(
      eventsQuery,
      (snapshot) => {
        const firestoreEvents = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data()
        }));

        if (firestoreEvents.length > 0) {
          // Use actual Firestore events when available.
          setEvents(firestoreEvents);
        } else if (canReadAllEvents) {
          // Do not show sample events in the event manager when there are no saved events.
          setEvents([]);
        } else {
          // Public homepage fallback when there are no published events.
          setEvents(
            defaultEvents.map((event) => ({
              ...event,
              published: true
            }))
          );
        }
      },
      (error) => {
        console.error("Unable to load events:", error);

        // Keep the public homepage useful if Firestore cannot load events.
        if (!canReadAllEvents) {
          setEvents(
            defaultEvents.map((event) => ({
              ...event,
              published: true
            }))
          );
        }
      }
    );

    const stopContent = onSnapshot(
      doc(db, "siteContent", "published"),
      (snapshot) => {
        if (snapshot.exists()) {
          setSiteContent({
            ...collegeDefaultContent,
            ...snapshot.data()
          });
        } else {
          setSiteContent(collegeDefaultContent);
        }
      },
      (error) => {
        console.error("Unable to load website content:", error);
      }
    );

    return () => {
      stopEvents();
      stopContent();
    };
  }, [isDemo, isOrganizer, organizerProfile]);

  // Load only public aggregate statistics and published announcements.
  // The homepage never queries private student registration documents for counters.
  useEffect(() => {
    if (isDemo) {
      setPublicStats({});
      setAnnouncements(defaultAnnouncements);
      return;
    }

    const stopStats = onSnapshot(
      doc(db, "publicStats", "overview"),
      (snapshot) => {
        setPublicStats(snapshot.exists() ? snapshot.data() : {});
      },
      (error) => {
        console.info("Public homepage stats are not configured yet:", error.message);
        setPublicStats({});
      }
    );

    const stopAnnouncements = onSnapshot(
      query(collection(db, "announcements"), where("published", "==", true)),
      (snapshot) => {
        const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        items.sort((a, b) => timestampForSort(b.createdAt) - timestampForSort(a.createdAt));
        // Show college-approved Firestore announcements when present; otherwise
        // keep the homepage populated with safe starter content.
        setAnnouncements(items.length ? items.slice(0, 4) : defaultAnnouncements);
      },
      (error) => {
        console.info("Published announcements are not configured yet:", error.message);
        setAnnouncements(defaultAnnouncements);
      }
    );

    return () => {
      stopStats();
      stopAnnouncements();
    };
  }, [isDemo]);

  // Load organizer-only registrations and contact messages.
  useEffect(() => {
    if (!isOrganizer || isDemo) {
      if (!isOrganizer) {
        setRegistrations([]);
        setContactMessages([]);
      }
      return;
    }

    const permissions = organizerProfile?.permissions || {};
    const fullAccess = ["owner", "admin"].includes(
      organizerProfile?.role
    );

    const canViewRegistrations =
      fullAccess || permissions.viewRegistrations === true;

    const canViewMessages =
      fullAccess || permissions.manageMessages === true;

    let stopRegistrations = null;
    let stopMessages = null;

    if (canViewRegistrations) {
      stopRegistrations = onSnapshot(
        collection(db, "registrations"),
        (snapshot) => {
          setRegistrations(
            snapshot.docs.map((item) => ({
              id: item.id,
              ...item.data()
            }))
          );
        },
        (error) => {
          console.error("Unable to load registrations:", error);
        }
      );
    } else {
      setRegistrations([]);
    }

    if (canViewMessages) {
      stopMessages = onSnapshot(
        collection(db, "contactMessages"),
        (snapshot) => {
          setContactMessages(
            snapshot.docs
              .map((item) => ({
                id: item.id,
                ...item.data()
              }))
              .sort((a, b) => {
                const dateA = a.createdAt?.toDate
                  ? a.createdAt.toDate().getTime()
                  : new Date(a.createdAt || 0).getTime();

                const dateB = b.createdAt?.toDate
                  ? b.createdAt.toDate().getTime()
                  : new Date(b.createdAt || 0).getTime();

                return dateB - dateA;
              })
          );
        },
        (error) => {
          console.error("Unable to load messages:", error);
        }
      );
    } else {
      setContactMessages([]);
    }

    return () => {
      if (stopRegistrations) stopRegistrations();
      if (stopMessages) stopMessages();
    };
  }, [isOrganizer, isDemo, organizerProfile]);

  const hasPermission = (key) => {
    if (isDemo) return isOrganizer;

    if (!isOrganizer || !organizerProfile) return false;

    if (["owner", "admin"].includes(organizerProfile.role)) {
      return true;
    }

    return organizerProfile.permissions?.[key] === true;
  };

  const requirePermission = (key) => {
    if (!hasPermission(key)) {
      throw new Error(
        "You do not have permission to perform this action."
      );
    }
  };

  const login = async (email, password) => {
    if (isDemo) {
      if (
        email.trim().toLowerCase() === "organizer@demo.local" &&
        password === "FestDemo2026!"
      ) {
        setUser(demoAdmin);
        setOrganizerProfile({
          ...demoAdmin,
          role: "admin",
          status: "approved",
          permissions: Object.fromEntries(
            PERMISSION_KEYS.map((key) => [key, true])
          )
        });
        setIsOrganizer(true);
        navigate("/admin");
        return;
      }

      throw new Error(
        "Firebase is not configured. For local demo use organizer@demo.local / FestDemo2026!"
      );
    }

    const credential = await signInWithEmailAndPassword(
      auth,
      email.trim(),
      password
    );

    await credential.user.reload();

    const currentUser = auth.currentUser;

    if (!currentUser?.emailVerified) {
      try {
        // Send a fresh verification link after the user successfully signs in.
        await sendEmailVerification(currentUser);
      } catch (emailError) {
        console.error("Unable to send organizer verification email:", emailError);
        await signOut(auth);

        throw new Error(
          "We couldn't send the verification email. Check your connection and " +
          "Firebase Authentication email settings, then try again."
        );
      }

      await signOut(auth);
      throw new Error(
        "A verification email has been sent. Check your inbox and spam folder, " +
        "click the verification link, then sign in again."
      );
    }

    const profileSnapshot = await getDoc(
      doc(db, "organizers", currentUser.uid)
    );

    if (!profileSnapshot.exists()) {
      await signOut(auth);
      throw new Error(
        "No organizer application was found for this account. Please register as an organizer first."
      );
    }

    const profile = profileSnapshot.data();

    if (!hasRoleAccess(profile)) {
      await signOut(auth);

      if (profile.status === "rejected") {
        throw new Error("Your organizer application was rejected.");
      }

      throw new Error(
        "Your organizer application is pending admin approval."
      );
    }

    setUser(currentUser);
    setOrganizerProfile({
      uid: currentUser.uid,
      ...profile
    });
    setIsOrganizer(true);
    navigate("/admin");
  };

  const registerOrganizer = async ({ name, email, password }) => {
    if (isDemo) {
      throw new Error(
        "Organizer registration requires Firebase to be configured."
      );
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (cleanName.length < 2) {
      throw new Error("Enter your full name.");
    }

    const credential = await createUserWithEmailAndPassword(
      auth,
      cleanEmail,
      password
    );

    try {
      await updateProfile(credential.user, {
        displayName: cleanName
      });

      const permissions = Object.fromEntries(
        PERMISSION_KEYS.map((key) => [key, false])
      );

      await setDoc(doc(db, "organizers", credential.user.uid), {
        uid: credential.user.uid,
        name: cleanName,
        email: cleanEmail,
        role: "organizer",
        status: "pending",
        permissions,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      await sendEmailVerification(credential.user);
      await signOut(auth);

      navigate("/organizer-login");

      return "Your application was submitted. Verify your email, then wait for an administrator to approve your account.";
    } catch (error) {
      throw new Error(
        error.message ||
          "Unable to submit your organizer application. Please contact the administrator."
      );
    }
  };

  const resetOrganizerPassword = async (email) => {
    if (isDemo) {
      throw new Error("Password reset requires Firebase configuration.");
    }

    await sendPasswordResetEmail(
      auth,
      email.trim().toLowerCase()
    );

    return "If the account exists, a password reset email will be sent.";
  };

  const registerStudent = async ({ name, email, password }) => {
    if (isDemo) {
      throw new Error("Student accounts need Firebase Authentication. Set VITE_DEMO_MODE=false and configure your Firebase environment variables.");
    }

    const cleanName = String(name || "").trim();
    const cleanEmail = String(email || "").trim().toLowerCase();
    if (cleanName.length < 2) throw new Error("Enter your full name.");
    if (!cleanEmail) throw new Error("Enter a valid email address.");
    if (String(password || "").length < 6) throw new Error("Use a password with at least 6 characters.");

    const credential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
    try {
      await updateProfile(credential.user, { displayName: cleanName });
      await sendEmailVerification(credential.user);
      await signOut(auth);
      return "Your student account has been created. Please verify your email using the link we sent, then sign in.";
    } catch (error) {
      throw new Error(error.message || "Your account was created, but we could not send the verification email. Try signing in or request a new verification email.");
    }
  };

  const loginStudent = async (email, password, returnTo = "") => {
    if (isDemo) {
      throw new Error("Student login needs Firebase Authentication. Configure Firebase and set VITE_DEMO_MODE=false.");
    }

    const credential = await signInWithEmailAndPassword(
      auth,
      String(email || "").trim().toLowerCase(),
      password
    );
    await credential.user.reload();
    const currentUser = auth.currentUser;

    if (!currentUser?.emailVerified) {
      await signOut(auth);
      throw new Error("Please verify your email from the link sent to your inbox before signing in.");
    }

    setUser(currentUser);
    // Ordinary student sign-in should return to the public home page.
    // Keep an explicit safe `next` destination when the student was sent
    // to login from a protected action (for example, event registration).
    const safeReturnTo = typeof returnTo === "string" && returnTo.startsWith("/") && !returnTo.startsWith("//")
      ? returnTo
      : "/";
    navigate(safeReturnTo);
    return "Signed in successfully.";
  };

  const resetStudentPassword = async (email) => {
    if (isDemo) {
      throw new Error("Password reset needs Firebase Authentication. Configure Firebase first.");
    }

    await sendPasswordResetEmail(auth, String(email || "").trim().toLowerCase());
    return "If an account exists for this email, a password reset link has been sent.";
  };

  const logout = async () => {
    if (!isDemo && auth?.currentUser) {
      await signOut(auth);
    }

    setUser(null);
    setOrganizerProfile(null);
    setIsOrganizer(false);
    setRegistrations([]);
    setContactMessages([]);
    navigate("/");
  };

  const saveEvent = async (event) => {
    requirePermission("manageEvents");

    const { id, ...data } = event;

    if (isDemo) {
      const next = id
        ? events.map((item) =>
            item.id === id ? { ...item, ...data } : item
          )
        : [
            {
              ...data,
              id: crypto.randomUUID()
            },
            ...events
          ];

      setEvents(next);
      localStorage.setItem(
        "fest-demo-events",
        JSON.stringify(next)
      );
      return;
    }

    if (id) {
      await updateDoc(doc(db, "events", id), {
        ...data,
        updatedAt: serverTimestamp()
      });
    } else {
      await addDoc(collection(db, "events"), {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
  };

  const removeEvent = async (id) => {
    requirePermission("manageEvents");

    if (isDemo) {
      const next = events.filter((event) => event.id !== id);
      setEvents(next);
      localStorage.setItem(
        "fest-demo-events",
        JSON.stringify(next)
      );
      return;
    }

    await deleteDoc(doc(db, "events", id));
  };

  const saveContent = async (content) => {
    requirePermission("manageContent");

    if (isDemo) {
      setSiteContent(content);
      localStorage.setItem(
        "fest-demo-content",
        JSON.stringify(content)
      );
      return;
    }

    await setDoc(
      doc(db, "siteContent", "published"),
      {
        ...content,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    setSiteContent(content);
  };

  const sendContactMessage = async (details) => {
    const record = {
      name: String(details.name || "").trim(),
      phone: String(details.phone || "").trim(),
      course: String(details.course || "").trim(),
      year: String(details.year || "").trim(),
      rollNumber: String(details.rollNumber || "").trim(),
      message: String(details.message || "").trim(),
      status: "New"
    };

    if (isDemo) {
      const next = [
        {
          ...record,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString()
        },
        ...contactMessages
      ];

      setContactMessages(next);
      localStorage.setItem(
        "fest-demo-contact-messages",
        JSON.stringify(next)
      );
      return;
    }

    await addDoc(collection(db, "contactMessages"), {
      ...record,
      createdAt: serverTimestamp()
    });
  };

  const markMessageRead = async (id) => {
    requirePermission("manageMessages");

    if (isDemo) {
      const next = contactMessages.map((message) =>
        message.id === id
          ? { ...message, status: "Reviewed" }
          : message
      );

      setContactMessages(next);
      localStorage.setItem(
        "fest-demo-contact-messages",
        JSON.stringify(next)
      );
      return;
    }

    await updateDoc(doc(db, "contactMessages", id), {
      status: "Reviewed",
      reviewedAt: serverTimestamp(),
      reviewedBy: user.uid
    });
  };

  const deleteRegistration = async (registration) => {
    requirePermission("viewRegistrations");

    if (isDemo) {
      const next = registrations.filter(
        (item) => item.id !== registration.id
      );

      setRegistrations(next);
      localStorage.setItem(
        "fest-demo-registrations",
        JSON.stringify(next)
      );
      return;
    }

    await deleteDoc(doc(db, "registrations", registration.id));
  };

  const registerForEvent = async (event, details) => {
    const enteredEmail = String(details.email || "").trim().toLowerCase();

    if (isDemo) {
      const existing = registrations.some(
        (item) =>
          item.eventId === event.id &&
          String(item.email || "").toLowerCase() === enteredEmail
      );

      if (existing) {
        throw new Error("This email is already registered for this event.");
      }

      const record = {
        name: String(details.name || "").trim(),
        email: enteredEmail,
        emailLower: enteredEmail,
        phone: String(details.phone || "").trim(),
        rollNumber: String(details.rollNumber || "").trim(),
        course: String(details.course || "").trim(),
        year: String(details.year || "").trim(),
        uid: null,
        id: crypto.randomUUID(),
        eventId: event.id,
        eventTitle: event.title,
        eventDate: event.date || "",
        eventTime: event.time || "",
        eventVenue: event.venue || "",
        eventDescription: event.description || "",
        eventCategory: event.category || "Event",
        eventColor: event.color || "lavender",
        passId: makeId(),
        createdAt: new Date().toISOString(),
        status: "confirmed"
      };

      const next = [...registrations, record];
      setRegistrations(next);
      localStorage.setItem("fest-demo-registrations", JSON.stringify(next));
      return record;
    }

    // Student registrations are tied to a verified Firebase account so private
    // registration details and digital passes can be securely retrieved later.
    if (!user?.uid) {
      throw new Error("Please sign in with your verified student account before registering.");
    }
    if (!user.emailVerified) {
      throw new Error("Verify your student email before registering for an event.");
    }
    const authEmail = String(user.email || "").trim();
    if (!authEmail || enteredEmail !== authEmail.toLowerCase()) {
      throw new Error("Use the same email address as your signed-in student account.");
    }

    const record = {
      name: String(details.name || user.displayName || "").trim(),
      email: authEmail,
      emailLower: authEmail.toLowerCase(),
      phone: String(details.phone || "").trim(),
      rollNumber: String(details.rollNumber || "").trim(),
      course: String(details.course || "").trim(),
      year: String(details.year || "").trim(),
      uid: user.uid,
      eventId: String(event.id),
      eventTitle: String(event.title || "Campus event"),
      eventDate: String(event.date || ""),
      eventTime: String(event.time || ""),
      eventVenue: String(event.venue || ""),
      eventDescription: String(event.description || ""),
      eventCategory: String(event.category || "Event"),
      eventColor: String(event.color || "lavender"),
      passId: makeId(),
      status: "confirmed",
      createdAt: serverTimestamp()
    };

    // Atomically save the private registration and update public aggregate counters.
    // No student names, emails, or roll numbers are stored in publicStats.
    const registrationRef = doc(collection(db, "registrations"));
    const statsRef = doc(db, "publicStats", "overview");
    const participantRef = doc(db, "participantRegistry", user.uid);

    await runTransaction(db, async (transaction) => {
      const [statsSnapshot, participantSnapshot] = await Promise.all([
        transaction.get(statsRef),
        transaction.get(participantRef)
      ]);
      const currentStats = statsSnapshot.exists() ? statsSnapshot.data() : {};
      const registrationsTotal = Number(currentStats.totalRegistrations || 0);
      const participantsTotal = Number(currentStats.totalParticipants || 0);
      const isFirstParticipantRegistration = !participantSnapshot.exists();

      transaction.set(registrationRef, record);
      if (isFirstParticipantRegistration) {
        transaction.set(participantRef, {
          uid: user.uid,
          registrationId: registrationRef.id,
          status: "confirmed",
          createdAt: serverTimestamp()
        });
      }
      transaction.set(statsRef, {
        totalRegistrations: registrationsTotal + 1,
        totalParticipants: participantsTotal + (isFirstParticipantRegistration ? 1 : 0),
        lastRegistrationId: registrationRef.id,
        updatedAt: serverTimestamp()
      }, { merge: true });
    });

    return {
      ...record,
      id: registrationRef.id,
      createdAt: new Date().toISOString()
    };
  };

  const uploadImage = async (file) => {
    if (!file) return "";

    if (isDemo) {
      return URL.createObjectURL(file);
    }

    requirePermission("manageEvents");

    const safeName = file.name.replace(
      /[^a-zA-Z0-9._-]/g,
      "_"
    );

    const imageRef = ref(
      storage,
      `event-images/${Date.now()}-${safeName}`
    );

    await uploadBytes(imageRef, file);
    return getDownloadURL(imageRef);
  };

  const common = {
    user,
    organizerProfile,
    isOrganizer,
    hasPermission,
    events,
    registrations,
    contactMessages,
    siteContent,
    publicStats,
    announcements,
    login,
    registerOrganizer,
    resetOrganizerPassword,
    registerStudent,
    loginStudent,
    resetStudentPassword,
    logout,
    saveEvent,
    removeEvent,
    saveContent,
    registerForEvent,
    deleteRegistration,
    sendContactMessage,
    markMessageRead,
    uploadImage,
    busy,
    setBusy
  };

  const path = location.pathname;

  if (path === "/organizer-login") {
    return <LoginPage {...common} />;
  }

  if (path === "/student-login" || path === "/student-register") {
    return <StudentAuthPage {...common} initialMode={path === "/student-register" ? "register" : "login"} />;
  }

  if (path.startsWith("/admin") && !isOrganizer) {
    return <LoginPage {...common} />;
  }

  if (path === "/admin") {
    return <AdminDashboard {...common} />;
  }

  if (path === "/admin/organizers") {
    return (
      <div className="organizers-effects-shell">
        <OrganizersManager
          user={user}
          organizerProfile={organizerProfile}
        />
      </div>
    );
  }

  if (path === "/admin/announcements") {
    return hasPermission("manageContent")
      ? <CampusAnnouncementsManager {...common} />
      : <AccessDenied {...common} />;
  }

  if (path === "/admin/events") {
    return <ManageEvents {...common} />;
  }

  if (path === "/admin/content") {
    return <ContentEditor {...common} />;
  }

  if (path === "/admin/registrations") {
    return hasPermission("viewRegistrations")
      ? <RegistrationManager {...common} />
      : <AccessDenied {...common} />;
  }

  if (path === "/admin/messages") {
    return hasPermission("manageMessages")
      ? <ContactMessagesManager {...common} />
      : <AccessDenied {...common} />;
  }

  if (path.startsWith("/register/")) {
    return (
      <RegistrationPage
        {...common}
        eventId={path.split("/").pop()}
      />
    );
  }

  if (path.startsWith("/pass/")) {
    return (
      <PassPage
        {...common}
        registrationId={path.split("/").pop()}
      />
    );
  }

  if (path === "/my-registrations") {
    return <MyRegistrations {...common} />;
  }

  return <HomePage {...common} />;
}


function SiteHeader({ isOrganizer = false, logout, user = null }) {
  const location = useLocation();
  const navigate = useNavigate();

  const goToSection = (sectionId) => (event) => {
    event.preventDefault();
    const scrollToSection = () => {
      window.setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }, 80);
    };

    if (location.pathname !== "/") {
      navigate("/");
      scrollToSection();
    } else {
      document.getElementById(sectionId)?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
  };

  return (
    <header className="navbar">
      <Link to="/" className="college-fest-brand" aria-label="Smt. B. Seetha Polytechnic Fest Club home">
        <span className="college-fest-name-wrap">
          <span className="college-fest-institution">Smt. B. Seetha Polytechnic</span>
          <span className="college-fest-title">Fest Club<span className="college-fest-title-dot"> ✦</span></span>
        </span>
        <span className="college-fest-live-scene" aria-hidden="true">
          <span className="fest-scene-spark fest-scene-spark-one">✦</span>
          <span className="fest-cartoon fest-cartoon-runner">🏃</span>
          <span className="fest-cartoon fest-cartoon-ball">⚽</span>
          <span className="fest-cartoon fest-cartoon-drummer">🥁</span>
          <span className="fest-cartoon fest-cartoon-dancer">💃</span>
          <span className="fest-scene-music">♫</span>
          <span className="fest-scene-spark fest-scene-spark-two">✧</span>
        </span>
      </Link>

      <nav className="nav-links" aria-label="Main navigation">
        <Link to="/#home" onClick={goToSection("home")}>Home</Link>
        <Link to="/#events" onClick={goToSection("events")}>Events</Link>
        <Link to="/#about" onClick={goToSection("about")}>About Fest</Link>
        <Link to="/#contact" onClick={goToSection("contact")}>Contact Us</Link>
      </nav>

      <div className="nav-left-account-group" aria-label="Account shortcuts">
        {user && (
          <span className="student-welcome">
            {isOrganizer
              ? (user.displayName || user.email?.split("@")[0] || "Organizer")
              : `Hi, ${user.displayName || user.email?.split("@")[0] || "Student"}`}
          </span>
        )}
        <Link to="/my-registrations" className="button button-outline">My Passes</Link>
        {!isOrganizer && (
          <Link to="/organizer-login" className="button button-outline">Organizer Login</Link>
        )}
      </div>

      <div className="nav-actions">
        {isOrganizer ? (
          <>
            <Link to="/admin" className="button button-outline">Dashboard</Link>
            <button type="button" className="button button-dark" onClick={logout}>Logout</button>
          </>
        ) : user ? (
          <button type="button" className="button button-dark" onClick={logout}>Logout</button>
        ) : (
          <Link to="/student-login" className="button button-dark student-auth-cta"><GraduationCap size={16} /> Student Login / Register</Link>
        )}
      </div>
    </header>
  );
}

const footerLinkStyle = { color: "#e5e7eb", textDecoration: "none", fontSize: 16, lineHeight: 1.5 };
const footerSocialStyle = { width: 44, height: 44, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "#293244", color: "#e5e7eb", textDecoration: "none", fontSize: 19 };
const footerIconStyle = { color: "#60a5fa", minWidth: 22, fontSize: 22, lineHeight: 1 };

const HOME_INTERACTIVE_STATS_STYLES = String.raw`
  .app-shell .hero-stats {
    position: relative;
    isolation: isolate;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    width: min(100%, 780px);
    margin-top: 30px;
    padding: 10px;
    overflow: hidden;
    border: 1px solid rgba(255,255,255,.7);
    border-radius: 26px;
    background: linear-gradient(125deg, rgba(255,255,255,.76), rgba(240,235,255,.67) 45%, rgba(225,248,255,.7));
    box-shadow: 0 18px 48px rgba(66, 44, 141, .13), inset 0 1px 0 rgba(255,255,255,.88);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
  }
  .app-shell .hero-stats::before,
  .app-shell .hero-stats::after {
    content: "";
    position: absolute;
    z-index: -1;
    width: 190px;
    height: 190px;
    border-radius: 50%;
    filter: blur(34px);
    opacity: .34;
    pointer-events: none;
  }
  .app-shell .hero-stats::before { top: -125px; left: 12%; background: #c4b5fd; }
  .app-shell .hero-stats::after { right: -80px; bottom: -145px; background: #67e8f9; }
  .app-shell .hero-stat-metric {
    --metric-accent: #7650e8;
    position: relative;
    display: flex;
    min-width: 0;
    min-height: 142px;
    flex-direction: column;
    align-items: flex-start;
    justify-content: space-between;
    gap: 13px;
    padding: 17px 17px 16px;
    border: 1px solid rgba(118,80,232,.13);
    border-radius: 19px;
    background: linear-gradient(150deg, rgba(255,255,255,.96), rgba(250,248,255,.85));
    box-shadow: 0 8px 24px rgba(39, 27, 87, .065), inset 0 1px 0 rgba(255,255,255,.95);
    transition: transform .24s ease, box-shadow .24s ease, border-color .24s ease;
    animation: festMetricEnter .55s both;
  }
  .app-shell .hero-stat-metric:nth-child(2) { --metric-accent: #e653a5; animation-delay: .08s; }
  .app-shell .hero-stat-metric:nth-child(3) { --metric-accent: #089db9; animation-delay: .16s; }
  .app-shell .hero-stat-metric::after {
    content: "";
    position: absolute;
    top: 0;
    left: 18px;
    right: 18px;
    height: 3px;
    border-radius: 0 0 8px 8px;
    background: linear-gradient(90deg, transparent, var(--metric-accent), transparent);
    opacity: .8;
  }
  .app-shell .hero-stat-metric:hover {
    transform: translateY(-5px);
    border-color: color-mix(in srgb, var(--metric-accent) 36%, white);
    box-shadow: 0 16px 32px rgba(39,27,87,.12), 0 0 0 3px color-mix(in srgb, var(--metric-accent) 8%, transparent);
  }
  .app-shell .hero-stat-top { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 8px; }
  .app-shell .hero-stat-icon {
    display: inline-flex;
    width: 39px;
    height: 39px;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--metric-accent);
    border-radius: 13px;
    background: color-mix(in srgb, var(--metric-accent) 11%, white);
    box-shadow: inset 0 1px 0 rgba(255,255,255,.9);
  }
  .app-shell .hero-stat-status {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: #617089;
    font-size: 9px;
    line-height: 1.3;
    font-weight: 800;
    letter-spacing: .085em;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .app-shell .hero-stat-status-dot { width: 6px; height: 6px; flex: 0 0 6px; border-radius: 50%; background: var(--metric-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--metric-accent) 13%, transparent); }
  .app-shell .hero-stat-value {
    display: block;
    color: #211b42;
    font-size: clamp(2rem, 3vw, 2.65rem);
    font-weight: 900;
    letter-spacing: -.065em;
    line-height: .98;
    font-variant-numeric: tabular-nums;
    text-shadow: 0 2px 0 rgba(255,255,255,.8);
  }
  .app-shell .hero-stat-label { display: block; color: #393454; font-size: 12px; line-height: 1.4; font-weight: 800; }
  .app-shell .hero-stat-note { display: block; margin-top: 4px; color: #7a7890; font-size: 10px; line-height: 1.35; font-weight: 600; }
  .app-shell .hero-stat-metric.is-pending .hero-stat-value { color: #74728b; letter-spacing: .02em; }
  @keyframes festMetricEnter { from { opacity: 0; transform: translateY(12px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @media (max-width: 680px) {
    .app-shell .hero-stats { gap: 7px; padding: 7px; border-radius: 20px; margin-top: 23px; }
    .app-shell .hero-stat-metric { min-height: 126px; gap: 10px; padding: 12px 10px; border-radius: 15px; }
    .app-shell .hero-stat-icon { width: 31px; height: 31px; border-radius: 10px; }
    .app-shell .hero-stat-icon svg { width: 16px; height: 16px; }
    .app-shell .hero-stat-status { font-size: 7px; letter-spacing: .035em; gap: 4px; }
    .app-shell .hero-stat-status-dot { width: 5px; height: 5px; flex-basis: 5px; }
    .app-shell .hero-stat-value { font-size: clamp(1.45rem, 7vw, 2.05rem); }
    .app-shell .hero-stat-label { font-size: 10px; }
    .app-shell .hero-stat-note { font-size: 9px; }
  }
  @media (max-width: 360px) {
    .app-shell .hero-stats { grid-template-columns: 1fr; }
    .app-shell .hero-stat-metric { min-height: auto; display: grid; grid-template-columns: 38px 1fr; align-items: center; gap: 4px 12px; }
    .app-shell .hero-stat-top { grid-row: span 2; width: auto; }
    .app-shell .hero-stat-status { display: none; }
    .app-shell .hero-stat-value, .app-shell .hero-stat-label, .app-shell .hero-stat-note { grid-column: 2; }
  }
  @media (prefers-reduced-motion: reduce) {
    .app-shell .hero-stat-metric { animation: none; transition: none; }
    .app-shell .hero-stat-metric:hover { transform: none; }
  }
`;

function HomePage(p) {
  const [showCollegeIntro, setShowCollegeIntro] = useState(true);

  const finishCollegeIntro = useMemo(
    () => () => {
      setShowCollegeIntro(false);
      try {
        sessionStorage.setItem("bseetha-intro-seen", "yes");
      } catch {
        // The intro can still close when session storage is unavailable.
      }
    },
    []
  );
  const [category, setCategory] = useState("All Events");
  const [search, setSearch] = useState("");
  const [contactForm, setContactForm] = useState({
    name: "",
    phone: "",
    course: "",
    year: "",
    rollNumber: "",
    message: ""
  });
  const [contactError, setContactError] = useState("");
  const [contactSuccess, setContactSuccess] = useState("");

  const updateContact = (key, value) => {
    setContactForm((old) => ({
      ...old,
      [key]: value
    }));
  };

  const submitContact = async (e) => {
    e.preventDefault();
    setContactError("");
    setContactSuccess("");

    try {
      await p.sendContactMessage(contactForm);

      setContactForm({
        name: "",
        phone: "",
        course: "",
        year: "",
        rollNumber: "",
        message: ""
      });

      setContactSuccess(
        "Your message has been sent successfully."
      );
    } catch (error) {
      setContactError(
        error.message || "Unable to send your message."
      );
    }
  };

  const events = p.events.filter(
    (event) => event.published !== false
  );

  const filtered = useMemo(
    () =>
      events.filter(
        (event) =>
          (
            category === "All Events" ||
            event.category === category
          ) &&
          String(event.title || "")
            .toLowerCase()
            .includes(search.toLowerCase())
      ),
    [events, category, search]
  );

  const upcomingEvents = useMemo(() => {
    const now = Date.now();
    return events
      .map((event) => ({ ...event, _eventTimestamp: getEventTimestamp(event) }))
      .filter((event) => Number.isFinite(event._eventTimestamp) && event._eventTimestamp > now)
      .sort((a, b) => a._eventTimestamp - b._eventTimestamp);
  }, [events]);

  const featuredEvent = upcomingEvents.find((event) => event.featured === true) || upcomingEvents[0] || null;
  const featuredEvents = useMemo(() => {
    const chosen = [];
    [...upcomingEvents.filter((event) => event.featured === true), ...upcomingEvents].forEach((event) => {
      if (!chosen.some((item) => item.id === event.id) && chosen.length < 3) chosen.push(event);
    });
    return chosen;
  }, [upcomingEvents]);

  const latestAnnouncements = useMemo(() => {
    if (Array.isArray(p.announcements) && p.announcements.length) return p.announcements.slice(0, 4);
    const legacy = p.siteContent.latestAnnouncements || p.siteContent.announcements;
    if (Array.isArray(legacy)) return legacy.slice(0, 4).map((item, index) => typeof item === "string" ? { id: `local-${index}`, title: item, body: "Check the event page for more details." } : { id: item.id || `local-${index}`, ...item });
    return [];
  }, [p.announcements, p.siteContent]);

  const readPublicCount = (key) => {
    const raw = p.publicStats?.[key];
    if (raw === null || raw === undefined || raw === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : null;
  };
  const totalRegistrations = readPublicCount("totalRegistrations");
  const totalParticipants = readPublicCount("totalParticipants");

  return (
    <div className="app-shell">
      <style>{HOME_INTERACTIVE_STATS_STYLES}</style>
      {showCollegeIntro && (
        <CollegeSplash onFinish={finishCollegeIntro} />
      )}
      <SiteHeader
        isOrganizer={p.isOrganizer}
        logout={p.logout}
        user={p.user}
      />

      <main>
        <section className="hero hero-festival" id="home">
          <div className="hero-animated-gradient hero-animated-gradient-one" aria-hidden="true" />
          <div className="hero-animated-gradient hero-animated-gradient-two" aria-hidden="true" />
          <div className="hero-copy">
            <div className="eyebrow">
              <Sparkles size={15} />
              {p.siteContent.heroEyebrow ||
                "YOUR CAMPUS. YOUR MOMENT."}
            </div>

            <h1>
              {p.siteContent.heroTitleLine1 || "Make some"}
              <br />
              <span>
                {p.siteContent.heroTitleLine2 ||
                  "campus magic."}
              </span>
            </h1>

            <p className="hero-description">
              {p.siteContent.heroDescription ||
                "Discover campus events, meet new people and make memorable college experiences."}
            </p>

            <div className="hero-actions">
              <a className="button button-dark" href="#events">
                {p.siteContent.heroButton || "Explore events"}
                <ArrowUpRight size={17} />
              </a>
              <Link className="button button-color" to={featuredEvent ? `/register/${featuredEvent.id}` : "/student-login"}>
                Register Now <UserPlus size={17} />
              </Link>
              <span className="hero-note">
                ✳ {p.siteContent.heroNote || "Good vibes. Great memories."}
              </span>
            </div>

            <div className="hero-stats" aria-label="Live campus fest statistics">
              <AnimatedMetric
                value={events.length}
                label="Published events"
                note="Open for discovery"
                status="On site"
                icon={<CalendarDays size={19} />}
              />
              <AnimatedMetric
                value={totalRegistrations}
                label="Registrations"
                note={totalRegistrations === null ? "Live total not configured" : "Recorded registrations"}
                status={totalRegistrations === null ? "Awaiting data" : "Live total"}
                icon={<Ticket size={19} />}
              />
              <AnimatedMetric
                value={totalParticipants}
                label="Participants"
                note={totalParticipants === null ? "Live total not configured" : "Registered participants"}
                status={totalParticipants === null ? "Awaiting data" : "Live total"}
                icon={<UsersRound size={19} />}
              />
            </div>
          </div>

          <div
            className={`hero-art ${
              p.siteContent.heroArtworkUrl
                ? "hero-art-custom"
                : ""
            }`}
          >
            {p.siteContent.heroArtworkUrl ? (
              <img
                className="hero-artwork-image"
                src={p.siteContent.heroArtworkUrl}
                alt="Campus fest artwork"
              />
            ) : (
              <>
                <div className="art-sticker sticker-top">
                  {p.siteContent.heroArtTopSticker ||
                    "LET'S GO! ↗"}
                </div>

                <div className="art-circle">
                  <span className="art-star">✳</span>
                  <span className="art-word">
                    {p.siteContent.heroArtWord1 || "CAMPUS"}
                  </span>
                  <span className="art-word art-word-outline">
                    {p.siteContent.heroArtWord2 || "VIBES"}
                  </span>
                  <span className="art-caption">
                    {p.siteContent.heroArtCaption ||
                      "MAKE IT COUNT ★"}{" "}
                    {p.siteContent.heroArtYear ||
                      new Date().getFullYear()}
                  </span>
                </div>

                <div className="art-sticker sticker-bottom">
                  {p.siteContent.heroArtBottomSticker ||
                    "GOOD TIMES ONLY ✷"}
                </div>

                <span className="floating-star">✦</span>
              </>
            )}
          </div>
        </section>

        <section className="festival-overview" aria-label="Festival overview">
          <div className="festival-overview-copy">
            <span className="festival-kicker"><Sparkles size={15} /> THE CAMPUS FEST EXPERIENCE</span>
            <h2>Find your people. <span>Make the moment.</span></h2>
            <p>One place for technical challenges, cultural stages, sports, and hands-on workshops.</p>
          </div>
          <div className="festival-countdown-wrap">
            {featuredEvent ? (
              <CountdownCard event={featuredEvent} />
            ) : (
              <div className="countdown-card countdown-empty">
                <div className="countdown-icon"><CalendarClock size={22} /></div>
                <div className="countdown-content">
                  <span className="countdown-label">NEXT UP</span>
                  <h3>Upcoming schedule</h3>
                  <p>New event dates will appear here as soon as they are published.</p>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="festival-categories" aria-labelledby="festival-categories-title">
          <div className="festival-section-heading">
            <div>
              <span className="festival-kicker">PICK YOUR VIBE</span>
              <h2 id="festival-categories-title">Something for every kind of star.</h2>
            </div>
            <a className="event-link" href="#events">Browse all events <ArrowUpRight size={16} /></a>
          </div>
          <div className="festival-category-grid">
            {[
              { name: "Technical", emoji: "⚡", note: "Build, code and solve", className: "category-tech" },
              { name: "Cultural", emoji: "🎤", note: "Perform, dance and express", className: "category-culture" },
              { name: "Sports", emoji: "🏆", note: "Compete as a team", className: "category-sports" },
              { name: "Workshop", emoji: "🛠️", note: "Learn something hands-on", className: "category-workshop" }
            ].map((item) => (
              <button
                key={item.name}
                type="button"
                className={`festival-category-card ${item.className}`}
                onClick={() => {
                  setCategory(item.name);
                  document.getElementById("events")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                <span className="category-emoji" aria-hidden="true">{item.emoji}</span>
                <span className="category-card-copy"><strong>{item.name}</strong><small>{item.note}</small></span>
                <ArrowUpRight size={18} className="category-arrow" />
              </button>
            ))}
          </div>
        </section>

        <section className="panel campus-panel">
          <div className="eyebrow">OUR CAMPUS</div>
          <h2>
            {p.siteContent.collegeName ||
              collegeDefaultContent.collegeName}
          </h2>
          <p>
            {p.siteContent.collegeDescription ||
              collegeDefaultContent.collegeDescription}
          </p>
          <a
            className="event-link"
            href={
              p.siteContent.collegeWebsiteUrl ||
              "#about"
            }
            target="_blank"
            rel="noreferrer"
          >
            {p.siteContent.collegeWebsiteLabel ||
              "Official college website"}{" "}
            <ArrowUpRight size={16} />
          </a>
        </section>

        <section className="upcoming-showcase" aria-labelledby="upcoming-showcase-title">
          <div className="festival-section-heading">
            <div>
              <span className="festival-kicker">SAVE THE DATE</span>
              <h2 id="upcoming-showcase-title">Coming up on campus.</h2>
              <p>Published events with upcoming dates, in date order.</p>
            </div>
          </div>
          {featuredEvents.length ? (
            <div className="upcoming-compact-grid">
              {featuredEvents.map((event) => (
                <article className="upcoming-compact-card" key={event.id}>
                  <div className={`upcoming-date-tile ${event.color || "lavender"}`}>
                    <span>{Number.isFinite(event._eventTimestamp) ? new Date(event._eventTimestamp).toLocaleDateString("en-IN", { month: "short" }) : formatDate(event.date).split(" ")[1] || "TBA"}</span>
                    <strong>{Number.isFinite(event._eventTimestamp) ? new Date(event._eventTimestamp).getDate() : "—"}</strong>
                  </div>
                  <div className="upcoming-compact-copy">
                    <span className="event-category-label">{event.category || "Campus event"}</span>
                    <h3>{event.title}</h3>
                    <p><Clock3 size={14} /> {event.time || "Time TBA"} <span>·</span> <MapPin size={14} /> {event.venue || "Venue TBA"}</p>
                    <Link to={`/register/${event.id}`}>Register <ArrowUpRight size={15} /></Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="festival-empty-state"><CalendarDays size={22} /><div><strong>No upcoming dates yet</strong><p>Published event dates will appear here when the organizers add them.</p></div></div>
          )}
        </section>

        <section className="event-section" id="events">
          <div className="section-heading">
            <div>
              <div className="eyebrow">
                {p.siteContent.eventsEyebrow ||
                  "THE GOOD STUFF"}
              </div>
              <h2>
                {(p.siteContent.eventsTitle ||
                  "Find your thing.").replace(/\.$/, "")}
              </h2>
              <p>
                {p.siteContent.eventsDescription ||
                  "Big ideas, loud music and moments worth showing up for."}
              </p>
            </div>

            <div className="event-count">
              <Ticket size={18} />
              {filtered.length} events to explore
            </div>
          </div>

          <div className="event-toolbar">
            <div className="filters">
              {categories.map((item) => (
                <button
                  key={item}
                  className={`filter-chip ${
                    category === item ? "active" : ""
                  }`}
                  onClick={() => setCategory(item)}
                >
                  {item}
                </button>
              ))}
            </div>

            <label className="search-box">
              <Search size={17} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find an event..."
              />
            </label>
          </div>

          <div className="event-grid">
            {filtered.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>

          {!filtered.length && (
            <p className="empty-state">
              No events found. Try another category or search.
            </p>
          )}
        </section>

        <section className="about-strip" id="about">
          <CalendarDays size={25} />
          <div>
            <div className="eyebrow">
              LEARN · CREATE · CELEBRATE
            </div>
            <h2>
              {p.siteContent.aboutTitle || "About Fest"}
            </h2>
            <p>
              {p.siteContent.aboutDescription ||
                collegeDefaultContent.aboutDescription}
            </p>
            <p>
              {p.siteContent.aboutExtraDescription ||
                collegeDefaultContent.aboutExtraDescription}
            </p>
          </div>
          <a href="#events" className="button button-dark">
            Explore events <ArrowUpRight size={17} />
          </a>
        </section>

        <section className="announcements-section" aria-labelledby="announcements-title">
          <div className="festival-section-heading">
            <div>
              <span className="festival-kicker"><Megaphone size={15} /> THE LATEST</span>
              <h2 id="announcements-title">Campus announcements.</h2>
              <p>Important updates and notices from the fest team.</p>
            </div>
          </div>
          {latestAnnouncements.length ? (
            <div className="announcement-grid">
              {latestAnnouncements.map((item, index) => (
                <article className="announcement-card" key={item.id || index}>
                  <div className="announcement-mark"><Megaphone size={18} /></div>
                  <div className="announcement-copy">
                    <div className="announcement-meta">{item.date || (item.createdAt ? new Date(timestampForSort(item.createdAt)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "FEST CLUB UPDATE")}</div>
                    <h3>{item.title || item.heading || "Campus update"}</h3>
                    <p>{item.body || item.description || item.message || "Check the events page for more information."}</p>
                    {item.link && <a href={item.link} target="_blank" rel="noreferrer">Read update <ArrowUpRight size={15} /></a>}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="festival-empty-state"><Megaphone size={22} /><div><strong>No announcements published yet</strong><p>Check back here for registration updates, schedules and event notices.</p></div></div>
          )}
        </section>

        <section className="contact-section" id="contact">
          <div className="section-heading">
            <div>
              <div className="eyebrow">
                WE’RE HERE TO HELP
              </div>
              <h2>
                Contact the <span>organizers.</span>
              </h2>
              <p>
                Have a question, suggestion or event-related
                message? Send it to the campus fest team.
              </p>
            </div>
          </div>

          <div className="contact-layout">
            <div className="panel contact-info">
              <div className="eyebrow">CAMPUS FEST DESK</div>
              <h3>
                {p.siteContent.collegeName ||
                  collegeDefaultContent.collegeName}
              </h3>
              <p>
                {p.siteContent.contactIntro ||
                  collegeDefaultContent.contactIntro}
              </p>
              <p>
                <strong>Email:</strong>{" "}
                <a
                  href={`mailto:${
                    p.siteContent.contactEmail ||
                    collegeDefaultContent.contactEmail
                  }`}
                >
                  {p.siteContent.contactEmail ||
                    collegeDefaultContent.contactEmail}
                </a>
              </p>
              <p>
                <strong>Location:</strong>{" "}
                {p.siteContent.campusLocation ||
                  collegeDefaultContent.campusLocation}
              </p>
              <a
                className="event-link"
                href={
                  p.siteContent.collegeWebsiteUrl ||
                  "https://vishnu.edu.in/"
                }
                target="_blank"
                rel="noreferrer"
              >
                Visit official website <ArrowUpRight size={16} />
              </a>
            </div>

            <form
              className="panel form-stack contact-form"
              onSubmit={submitContact}
            >
              <label>
                Name
                <input
                  required
                  minLength="2"
                  value={contactForm.name}
                  onChange={(e) =>
                    updateContact("name", e.target.value)
                  }
                />
              </label>

              <label>
                Phone number
                <input
                  required
                  type="tel"
                  pattern="[0-9+()\- ]{10,16}"
                  value={contactForm.phone}
                  onChange={(e) =>
                    updateContact("phone", e.target.value)
                  }
                />
              </label>

              <div className="form-row">
                <label>
                  Course
                  <input
                    required
                    value={contactForm.course}
                    onChange={(e) =>
                      updateContact("course", e.target.value)
                    }
                    placeholder="e.g. B.Tech CSE"
                  />
                </label>

                <label>
                  Study year
                  <select
                    required
                    value={contactForm.year}
                    onChange={(e) =>
                      updateContact("year", e.target.value)
                    }
                  >
                    <option value="">Select year</option>
                    {[
                      "1st year",
                      "2nd year",
                      "3rd year",
                      "4th year",
                      "Other"
                    ].map((year) => (
                      <option key={year}>{year}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label>
                Roll number
                <input
                  required
                  value={contactForm.rollNumber}
                  onChange={(e) =>
                    updateContact("rollNumber", e.target.value)
                  }
                />
              </label>

              <label>
                Message to organizers
                <textarea
                  required
                  minLength="5"
                  rows="4"
                  value={contactForm.message}
                  onChange={(e) =>
                    updateContact("message", e.target.value)
                  }
                />
              </label>

              {contactError && (
                <div className="error" role="alert">
                  {contactError}
                </div>
              )}

              {contactSuccess && (
                <p role="status">{contactSuccess}</p>
              )}

              <button
                className="button button-dark full"
                type="submit"
              >
                Send message <ArrowUpRight size={16} />
              </button>

              <small className="privacy-note">
                Your message and contact details will be visible
                to authorized organizers.
              </small>
            </form>
          </div>
        </section>
      </main>

      <footer className="fest-footer" style={{ background: "#111827", color: "#e5e7eb", marginTop: 48, borderTop: "4px solid #4338ca" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 40, padding: "52px 32px 44px", maxWidth: 1440, margin: "0 auto" }}>
          <div>
            <Link to="/" aria-label="Smt. B. Seetha Polytechnic home" style={{ display: "inline-flex", alignItems: "center", gap: 12, color: "#fff", textDecoration: "none", marginBottom: 18 }}>
              <img
                src="/college-footer-logo.png"
                alt="Smt. B. Seetha Polytechnic logo"
                className="college-footer-logo"
                style={{ width: 60, height: 60, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
              />
              <span>
                <strong style={{ display: "block", fontSize: 19, lineHeight: 1.35 }}>Smt. B. Seetha Polytechnic</strong>
              </span>
            </Link>
            <p style={{ color: "#b8c1d1", lineHeight: 1.8, maxWidth: 390, margin: "0 0 20px" }}>
              Sri Vishnu Educational Society — empowering students through technical, cultural, sports, and workshop events.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <a href="https://seethapoly.edu.in/" target="_blank" rel="noreferrer" aria-label="College official website" style={footerSocialStyle}>🌐</a>
              <a href="mailto:info@seethapoly.edu.in" aria-label="Email the college" style={footerSocialStyle}>✉</a>
            </div>
          </div>

          <div>
            <h3 style={{ color: "#fff", fontSize: 18, margin: "4px 0 22px" }}>Quick Links</h3>
            <div style={{ display: "grid", gap: 12 }}>
              <a href="#home" onClick={(e) => { e.preventDefault(); document.getElementById("home")?.scrollIntoView({ behavior: "smooth" }); }} style={footerLinkStyle}>Home</a>
              <a href="#events" onClick={(e) => { e.preventDefault(); document.getElementById("events")?.scrollIntoView({ behavior: "smooth" }); }} style={footerLinkStyle}>Explore Events</a>
              <Link to="/my-registrations" style={footerLinkStyle}>My Passes / Register Now</Link>
              <a href="#contact" onClick={(e) => { e.preventDefault(); document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" }); }} style={footerLinkStyle}>Contact Us</a>
              <a href="https://seethapoly.edu.in/" target="_blank" rel="noreferrer" style={footerLinkStyle}>College Website ↗</a>
            </div>
          </div>

          <div>
            <h3 style={{ color: "#fff", fontSize: 18, margin: "4px 0 22px" }}>Contact</h3>
            <div style={{ display: "grid", gap: 16, color: "#e5e7eb", lineHeight: 1.6 }}>
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}><span style={footerIconStyle}>⌖</span><span>Sri Vishnu Educational Society,<br />Bhimavaram, Andhra Pradesh 534239</span></div>
              <a href="mailto:info@seethapoly.edu.in" style={{ ...footerLinkStyle, display: "flex", gap: 14, alignItems: "center" }}><span style={footerIconStyle}>✉</span>info@seethapoly.edu.in</a>
              <a href="https://seethapoly.edu.in/" target="_blank" rel="noreferrer" style={{ ...footerLinkStyle, display: "flex", gap: 14, alignItems: "center" }}><span style={footerIconStyle}>◎</span>seethapoly.edu.in</a>
            </div>
          </div>
        </div>
        <div style={{ borderTop: "1px solid #293244", maxWidth: 1440, margin: "0 auto", padding: "22px 32px", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", color: "#8290a8", fontSize: 13 }}>
          <span>© {new Date().getFullYear()} FEST CLUB. All rights reserved.</span>
          <span>DISCOVER · PARTICIPATE · CELEBRATE</span>
        </div>
      </footer>
    </div>
  );
}

function AnimatedMetric({ value, label, note, status, icon }) {
  const numeric = typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
  const [shown, setShown] = useState(numeric === null ? "—" : 0);

  useEffect(() => {
    if (numeric === null) {
      setShown("—");
      return undefined;
    }

    // Count smoothly without leaving an interval running after an update/unmount.
    if (numeric === 0) {
      setShown(0);
      return undefined;
    }

    let current = 0;
    const steps = Math.min(Math.max(Math.ceil(numeric), 1), 28);
    const increment = numeric / steps;
    const timer = window.setInterval(() => {
      current += 1;
      setShown(current >= steps ? numeric : Math.min(Math.round(increment * current), numeric));
      if (current >= steps) window.clearInterval(timer);
    }, 28);

    return () => window.clearInterval(timer);
  }, [numeric]);

  const pending = numeric === null;

  return (
    <div className={`hero-stat-metric${pending ? " is-pending" : ""}`}>
      <div className="hero-stat-top">
        <span className="hero-stat-icon" aria-hidden="true">{icon}</span>
        <span className="hero-stat-status"><span className="hero-stat-status-dot" />{status || (pending ? "Awaiting data" : "Live total")}</span>
      </div>
      <strong className="hero-stat-value" aria-label={`${label}: ${pending ? "not available yet" : numeric.toLocaleString("en-IN")}`}>
        {typeof shown === "number" ? shown.toLocaleString("en-IN") : shown}
      </strong>
      <div>
        <span className="hero-stat-label">{label}</span>
        <span className="hero-stat-note">{note || (pending ? "Public total not configured" : "Updated from live data")}</span>
      </div>
    </div>
  );
}

function CountdownCard({ event }) {
  const [now, setNow] = useState(Date.now());
  const target = getEventTimestamp(event);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [event?.id]);

  const remaining = target - now;
  const dateLabel = Number.isFinite(target)
    ? new Date(target).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "Date to be announced";

  const timeParts = remaining > 0
    ? [
        { label: "days", value: Math.floor(remaining / 86400000) },
        { label: "hrs", value: Math.floor((remaining % 86400000) / 3600000) },
        { label: "min", value: Math.floor((remaining % 3600000) / 60000) },
        { label: "sec", value: Math.floor((remaining % 60000) / 1000) }
      ]
    : [];

  return (
    <div className="countdown-card">
      <div className="countdown-icon"><CalendarClock size={22} /></div>
      <div className="countdown-content">
        <span className="countdown-label">NEXT UP · {event.category || "CAMPUS EVENT"}</span>
        <h3>{event.title}</h3>
        <p>{dateLabel} {event.venue ? ` · ${event.venue}` : ""}</p>
        {timeParts.length ? (
          <div className="countdown-timer" aria-label="Countdown to the event">
            {timeParts.map((part) => <div key={part.label}><strong>{String(part.value).padStart(2, "0")}</strong><span>{part.label}</span></div>)}
          </div>
        ) : <span className="countdown-finished">Event date has passed</span>}
        <Link to={`/register/${event.id}`} className="countdown-register">Save your spot <ArrowUpRight size={15} /></Link>
      </div>
    </div>
  );
}

function EventCard({ event }) {
  const emoji =
    event.category === "Technical"
      ? "💻"
      : event.category === "Cultural"
        ? "🎸"
        : event.category === "Sports"
          ? "🏆"
          : event.category === "Workshop"
            ? "🛠️"
            : "🎨";

  return (
    <article className="event-card">
      <div className={`event-art ${event.color || "lavender"}`}>
        <span className="event-category">
          {event.category || "Event"}
        </span>

        {event.image ? (
          <img src={event.image} alt={event.title} />
        ) : (
          <span className="event-emoji">{emoji}</span>
        )}

        <span className="event-date">
          {formatDate(event.date)}
        </span>
      </div>

      <div className="event-content">
        <h3>{event.title}</h3>
        <p>{event.description}</p>

        <div className="event-meta">
          <span>
            <Clock3 size={15} />
            {event.time || "Time TBA"}
          </span>
          <span>
            <MapPin size={15} />
            {event.venue || "Venue TBA"}
          </span>
        </div>

        <div className="event-footer">
          <span className="event-price">
            {event.price || "Free"}
          </span>
          <Link
            className="event-link"
            to={`/register/${event.id}`}
          >
            Register <ArrowUpRight size={17} />
          </Link>
        </div>
      </div>
    </article>
  );
}

function LoginPage(p) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(
    demoMode || !firebaseConfigured
      ? "organizer@demo.local"
      : ""
  );
  const [password, setPassword] = useState(
    demoMode || !firebaseConfigured
      ? "FestDemo2026!"
      : ""
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);

    try {
      if (mode === "login") {
        await p.login(email, password);
      } else if (mode === "register") {
        const result = await p.registerOrganizer({
          name,
          email,
          password
        });

        setMessage(result);
        setMode("login");
        setPassword("");
      } else {
        const result = await p.resetOrganizerPassword(email);
        setMessage(result);
      }
    } catch (err) {
      setError(err.message || "Unable to complete the request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell organizer-auth-shell">
      <SiteHeader />

      <div className="auth-card organizer-auth-card">
        <div className="auth-icon">
          <ShieldCheck size={28} />
        </div>

        <div className="eyebrow">RESTRICTED AREA</div>

        <h1>
          {mode === "login"
            ? "Organizer login"
            : mode === "register"
              ? "Register as organizer"
              : "Reset password"}
        </h1>

        <p>
          {mode === "login"
            ? "Sign in with an approved organizer account."
            : mode === "register"
              ? "Create an organizer application. Admin approval is required before access."
              : "Enter your registered email to receive a password reset link."}
        </p>

        {(demoMode || !firebaseConfigured) &&
          mode === "login" && (
            <div className="demo-note">
              <strong>Local demo credentials</strong>
              <br />
              organizer@demo.local
              <br />
              FestDemo2026!
              <br />
              <small>
                Demo only. Do not deploy with demo mode enabled.
              </small>
            </div>
          )}

        <form onSubmit={submit} className="form-stack">
          {mode === "register" && (
            <label>
              Full name
              <input
                required
                minLength="2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </label>
          )}

          <label>
            Email address
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>

          {mode !== "reset" && (
            <label>
              Password
              <input
                required
                minLength={mode === "register" ? 6 : undefined}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={
                  mode === "login"
                    ? "current-password"
                    : "new-password"
                }
              />
            </label>
          )}

          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}

          {message && <p role="status">{message}</p>}

          <button
            className="button button-dark full"
            type="submit"
            disabled={submitting}
          >
            {submitting
              ? "Please wait..."
              : mode === "login"
                ? "Sign in securely"
                : mode === "register"
                  ? "Submit application"
                  : "Send reset link"}
            <ArrowUpRight size={16} />
          </button>
        </form>

        <div className="form-stack" style={{ marginTop: 16 }}>
          {mode === "login" && (
            <>
              <button
                className="button button-outline full"
                type="button"
                onClick={() => {
                  setMode("register");
                  setError("");
                  setMessage("");
                }}
              >
                Register as Organizer
              </button>

              <button
                className="back-link"
                type="button"
                onClick={() => {
                  setMode("reset");
                  setError("");
                  setMessage("");
                }}
              >
                Forgot password?
              </button>
            </>
          )}

          {mode !== "login" && (
            <button
              className="back-link"
              type="button"
              onClick={() => {
                setMode("login");
                setError("");
                setMessage("");
              }}
            >
              ← Back to login
            </button>
          )}
        </div>

        <Link className="back-link" to="/">
          ← Back to public website
        </Link>
      </div>
    </div>
  );
}

function StudentAuthPage({ initialMode = "login", ...p }) {
  const authLocation = useLocation();
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);

    try {
      if (mode === "register") {
        const result = await p.registerStudent({ name, email, password });
        setMessage(result);
        setMode("login");
        setPassword("");
      } else if (mode === "login") {
        const returnTo = new URLSearchParams(authLocation.search).get("next") || "";
        await p.loginStudent(email, password, returnTo);
      } else {
        setMessage(await p.resetStudentPassword(email));
      }
    } catch (err) {
      const messages = {
        "auth/email-already-in-use": "An account already exists for this email. Sign in instead.",
        "auth/invalid-email": "Enter a valid email address.",
        "auth/weak-password": "Use a password with at least 6 characters.",
        "auth/invalid-credential": "Email or password is incorrect.",
        "auth/user-not-found": "No account was found for this email. Register first.",
        "auth/too-many-requests": "Too many attempts. Wait a while and try again."
      };
      setError(messages[err.code] || err.message || "Unable to complete the request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell student-auth-shell">
      <SiteHeader user={p.user} isOrganizer={p.isOrganizer} logout={p.logout} />
      <div className="auth-card student-auth-card">
        <div className="auth-icon student-auth-icon"><GraduationCap size={28} /></div>
        <div className="eyebrow">STUDENT ACCESS</div>
        <h1>{mode === "login" ? "Welcome back." : mode === "register" ? "Join the fest." : "Reset your password."}</h1>
        <p>{mode === "login" ? "Sign in to your student account to continue to the Fest Club home page." : mode === "register" ? "Create your account to keep your campus event experience in one place." : "Enter your email and we’ll send a password reset link."}</p>

        <form onSubmit={submit} className="form-stack">
          {mode === "register" && <label>Full name<input required minLength="2" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Your full name" /></label>}
          <label>Email address<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="student@example.com" /></label>
          {mode !== "reset" && <label>Password<input required minLength={mode === "register" ? 6 : undefined} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder={mode === "register" ? "At least 6 characters" : "Your password"} /></label>}
          {error && <div className="error" role="alert">{error}</div>}
          {message && <div className="success-message" role="status">{message}</div>}
          <button className="button button-dark full" type="submit" disabled={submitting}>{submitting ? "Please wait…" : mode === "login" ? "Student sign in" : mode === "register" ? "Create student account" : "Send reset link"}<ArrowUpRight size={16} /></button>
        </form>

        <div className="student-auth-switches">
          {mode === "login" && <>
            <button type="button" className="back-link" onClick={() => { setMode("register"); setError(""); setMessage(""); }}>New student? Create account</button>
            <button type="button" className="back-link" onClick={() => { setMode("reset"); setError(""); setMessage(""); }}>Forgot password?</button>
          </>}
          {mode !== "login" && <button type="button" className="back-link" onClick={() => { setMode("login"); setError(""); setMessage(""); }}>← Back to student login</button>}
        </div>
        <p className="student-auth-note">Email verification is required before student sign-in. Organizer access remains separate.</p>
        <Link className="back-link" to="/">← Back to Fest Club</Link>
      </div>
    </div>
  );
}

function AdminLayout({ p, title, subtitle, children }) {
  const can = (key) =>
    p.hasPermission ? p.hasPermission(key) : p.isOrganizer;

  return (
    <div className="app-shell admin-shell">
      <SiteHeader
        isOrganizer={p.isOrganizer}
        logout={p.logout}
      />

      <div className="admin-heading">
        <div>
          <div className="eyebrow">
            <ShieldCheck size={14} /> ORGANIZER WORKSPACE
          </div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>

        <Link to="/" className="button button-outline">
          View public site <ArrowUpRight size={15} />
        </Link>
      </div>

      <div className="admin-nav">
        <Link to="/admin">
          <LayoutDashboard size={16} /> Overview
        </Link>

        {can("manageEvents") && (
          <Link to="/admin/events">
            <CalendarDays size={16} /> Events
          </Link>
        )}

        {can("manageContent") && (
          <Link to="/admin/content">
            <Pencil size={16} /> Website editor
          </Link>
        )}

        {can("manageContent") && (
          <Link to="/admin/announcements">
            <Megaphone size={16} /> Campus announcements
          </Link>
        )}

        {can("viewRegistrations") && (
          <Link to="/admin/registrations">
            <Users size={16} /> Registrations
          </Link>
        )}

        {can("manageOrganizers") && (
          <Link to="/admin/organizers">
            <Users size={16} /> Organizers
          </Link>
        )}

        {can("manageMessages") && (
          <Link to="/admin/messages">
            <Mail size={16} /> Student messages (
            {p.contactMessages?.filter(
              (m) => m.status !== "Reviewed"
            ).length || 0}
            )
          </Link>
        )}
      </div>

      {children}
    </div>
  );
}

function AdminDashboard(p) {
  const published = p.events.filter(
    (event) => event.published !== false
  ).length;

  const can = (key) =>
    p.hasPermission ? p.hasPermission(key) : p.isOrganizer;

  const stats = [
    {
      label: "Total events",
      value: p.events.length,
      icon: CalendarDays
    },
    {
      label: "Published",
      value: published,
      icon: Ticket
    },
    ...(can("viewRegistrations")
      ? [
          {
            label: "Registrations",
            value: p.registrations.length,
            icon: Users
          }
        ]
      : [])
  ];

  return (
    <AdminLayout
      p={p}
      title="Your fest, your control."
      subtitle="Manage events, edit your website and keep track of student registrations."
    >
      <div className="stats-grid">
        {stats.map((s) => (
          <div className="stat-card" key={s.label}>
            <s.icon size={22} />
            <span>{s.label}</span>
            <strong>{s.value}</strong>
          </div>
        ))}
      </div>

      <div className="dashboard-grid">
        {can("manageMessages") && (
          <Link className="manage-tile" to="/admin/messages">
            <Mail />
            <h3>Student messages / issues</h3>
            <p>
              Read questions, suggestions and issues submitted
              through Contact.
            </p>
            <span>Open message inbox ↗</span>
          </Link>
        )}

        {can("manageEvents") && (
          <Link className="manage-tile" to="/admin/events">
            <CalendarDays />
            <h3>Manage events</h3>
            <p>Create, update or remove events.</p>
            <span>Open event manager ↗</span>
          </Link>
        )}

        {can("manageContent") && (
          <Link className="manage-tile" to="/admin/content">
            <Pencil />
            <h3>Edit website sections</h3>
            <p>
              Change homepage copy, about section and contact details.
            </p>
            <span>Open website editor ↗</span>
          </Link>
        )}

        {can("manageContent") && (
          <Link className="manage-tile campus-announcements-tile" to="/admin/announcements">
            <Megaphone />
            <h3>Campus announcements</h3>
            <p>Publish campus notices, share registration updates, and manage announcement visibility on the public homepage.</p>
            <span>Manage campus updates ↗</span>
          </Link>
        )}

        {can("viewRegistrations") && (
          <Link
            className="manage-tile"
            to="/admin/registrations"
          >
            <Users />
            <h3>Student registrations</h3>
            <p>Review participants and export CSV.</p>
            <span>View registrations ↗</span>
          </Link>
        )}

        {can("manageOrganizers") && (
          <Link className="manage-tile" to="/admin/organizers">
            <Users />
            <h3>Organizer access</h3>
            <p>Review organizer applications and permissions.</p>
            <span>Manage organizers ↗</span>
          </Link>
        )}
      </div>
    </AdminLayout>
  );
}


function CampusAnnouncementsManager(p) {
  const blankAnnouncement = () => ({
    title: "",
    body: "",
    date: new Date().toISOString().slice(0, 10),
    link: "",
    published: true
  });

  const [items, setItems] = useState([]);
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(true);
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);
  const [deletingAnnouncementId, setDeletingAnnouncementId] = useState("");
  const [editingAnnouncementId, setEditingAnnouncementId] = useState("");
  const [form, setForm] = useState(blankAnnouncement);
  const [announcementError, setAnnouncementError] = useState("");
  const [announcementNotice, setAnnouncementNotice] = useState("");

  const canManageAnnouncements = p.hasPermission
    ? p.hasPermission("manageContent")
    : Boolean(p.isOrganizer);

  useEffect(() => {
    if (!canManageAnnouncements) {
      setAnnouncementError("You do not have permission to manage campus announcements.");
      setLoadingAnnouncements(false);
      return undefined;
    }

    const stop = onSnapshot(
      collection(db, "announcements"),
      (snapshot) => {
        const next = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        next.sort((a, b) => timestampForSort(b.createdAt || b.updatedAt) - timestampForSort(a.createdAt || a.updatedAt));
        setItems(next);
        setLoadingAnnouncements(false);
      },
      (error) => {
        console.error("Unable to load campus announcements:", error);
        setAnnouncementError(
          error.code === "permission-denied"
            ? "Firestore blocked access. Check the announcements rules in firestore.rules."
            : "Unable to load announcements. Please try again."
        );
        setLoadingAnnouncements(false);
      }
    );

    return () => stop();
  }, [canManageAnnouncements]);

  const setAnnouncementField = (key, value) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const resetAnnouncementForm = () => {
    setForm(blankAnnouncement());
    setEditingAnnouncementId("");
    setAnnouncementError("");
  };

  const editAnnouncement = (item) => {
    setAnnouncementError("");
    setAnnouncementNotice("");
    setEditingAnnouncementId(item.id);
    setForm({
      title: item.title || item.heading || "",
      body: item.body || item.description || item.message || "",
      date: item.date || (item.createdAt ? new Date(timestampForSort(item.createdAt)).toISOString().slice(0, 10) : ""),
      link: item.link || "",
      published: item.published === true
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveAnnouncement = async (event) => {
    event.preventDefault();
    setAnnouncementError("");
    setAnnouncementNotice("");

    if (!canManageAnnouncements) {
      setAnnouncementError("You do not have permission to publish announcements.");
      return;
    }

    const title = form.title.trim();
    const body = form.body.trim();
    const link = form.link.trim();
    if (title.length < 3 || title.length > 120) {
      setAnnouncementError("Title must contain between 3 and 120 characters.");
      return;
    }
    if (body.length < 5 || body.length > 3000) {
      setAnnouncementError("Announcement text must contain between 5 and 3,000 characters.");
      return;
    }
    if (link && !/^https?:\/\//i.test(link)) {
      setAnnouncementError("The optional link must start with http:// or https://.");
      return;
    }

    setSavingAnnouncement(true);
    const payload = {
      title,
      body,
      date: form.date.trim(),
      link,
      published: Boolean(form.published),
      updatedAt: serverTimestamp()
    };

    try {
      if (editingAnnouncementId) {
        await updateDoc(doc(db, "announcements", editingAnnouncementId), payload);
        setAnnouncementNotice("Announcement updated successfully.");
      } else {
        await addDoc(collection(db, "announcements"), {
          ...payload,
          createdAt: serverTimestamp(),
          createdBy: auth.currentUser?.uid || ""
        });
        setAnnouncementNotice(form.published ? "Announcement published successfully." : "Announcement saved as a draft.");
      }
      resetAnnouncementForm();
    } catch (error) {
      console.error("Unable to save announcement:", error);
      setAnnouncementError(
        error.code === "permission-denied"
          ? "Firestore denied this change. Publish the announcements rules included with this update."
          : "Unable to save this announcement. Please try again."
      );
    } finally {
      setSavingAnnouncement(false);
    }
  };

  const toggleAnnouncementPublished = async (item) => {
    setAnnouncementError("");
    setAnnouncementNotice("");
    try {
      await updateDoc(doc(db, "announcements", item.id), {
        published: item.published !== true,
        updatedAt: serverTimestamp()
      });
      setAnnouncementNotice(item.published === true ? "Announcement moved to drafts." : "Announcement published on the public homepage.");
    } catch (error) {
      console.error("Unable to change announcement visibility:", error);
      setAnnouncementError(error.code === "permission-denied" ? "Firestore rules blocked this action. Check manageContent access." : "Unable to change announcement visibility.");
    }
  };

  const removeAnnouncement = async (item) => {
    const confirmed = window.confirm(`Delete the announcement “${item.title || item.heading || "Campus update"}”? This cannot be undone.`);
    if (!confirmed) return;
    setDeletingAnnouncementId(item.id);
    setAnnouncementError("");
    setAnnouncementNotice("");
    try {
      await deleteDoc(doc(db, "announcements", item.id));
      if (editingAnnouncementId === item.id) resetAnnouncementForm();
      setAnnouncementNotice("Announcement deleted.");
    } catch (error) {
      console.error("Unable to delete announcement:", error);
      setAnnouncementError(error.code === "permission-denied" ? "Firestore rules blocked deletion. Check the announcements delete rule." : "Unable to delete announcement.");
    } finally {
      setDeletingAnnouncementId("");
    }
  };

  const publishedCount = items.filter((item) => item.published === true).length;
  const draftCount = items.length - publishedCount;

  return (
    <AdminLayout
      p={p}
      title="Campus announcements."
      subtitle="Create clear campus updates and choose which notices appear on the public Fest Club homepage."
    >
      <div className="ca-page">
        <div className="ca-hero-row">
          <div className="ca-hero-icon"><Megaphone size={25} /></div>
          <div className="ca-hero-copy">
            <span className="ca-eyebrow">CAMPUS COMMUNICATIONS</span>
            <h2>Keep everyone in the loop.</h2>
            <p>Write announcements once, then publish or unpublish them whenever you need.</p>
          </div>
          <div className="ca-hero-stats">
            <div><strong>{items.length}</strong><span>Total</span></div>
            <div><strong>{publishedCount}</strong><span>Published</span></div>
            <div><strong>{draftCount}</strong><span>Drafts</span></div>
          </div>
        </div>

        {announcementError && <div className="ca-alert ca-alert-error" role="alert"><AlertCircle size={18} /><span>{announcementError}</span><button type="button" aria-label="Dismiss error" onClick={() => setAnnouncementError("")}><X size={16} /></button></div>}
        {announcementNotice && <div className="ca-alert ca-alert-success" role="status"><CheckCircle2 size={18} /><span>{announcementNotice}</span><button type="button" aria-label="Dismiss notification" onClick={() => setAnnouncementNotice("")}><X size={16} /></button></div>}

        <div className="ca-content-grid">
          <section className="ca-form-card">
            <div className="ca-section-heading">
              <span className="ca-section-icon"><Pencil size={18} /></span>
              <div><span className="ca-eyebrow">{editingAnnouncementId ? "UPDATE NOTICE" : "NEW NOTICE"}</span><h3>{editingAnnouncementId ? "Edit announcement" : "Create announcement"}</h3></div>
            </div>
            <form onSubmit={saveAnnouncement} className="ca-form">
              <label>Announcement title<input required minLength={3} maxLength={120} value={form.title} onChange={(event) => setAnnouncementField("title", event.target.value)} placeholder="e.g. Event registrations are now open" /></label>
              <label>Announcement message<textarea required minLength={5} maxLength={3000} rows={5} value={form.body} onChange={(event) => setAnnouncementField("body", event.target.value)} placeholder="Share the important details with students…" /></label>
              <div className="ca-two-fields">
                <label>Display date<input type="date" value={form.date} onChange={(event) => setAnnouncementField("date", event.target.value)} /></label>
                <label>Optional link<input type="url" value={form.link} onChange={(event) => setAnnouncementField("link", event.target.value)} placeholder="https://example.com" /></label>
              </div>
              <label className={`ca-publish-toggle ${form.published ? "is-published" : ""}`}>
                <input type="checkbox" checked={form.published} onChange={(event) => setAnnouncementField("published", event.target.checked)} />
                <span className="ca-toggle-track"><span /></span>
                <span className="ca-toggle-copy"><strong>{form.published ? "Publish announcement" : "Save as draft"}</strong><small>{form.published ? "Visible on the public homepage" : "Only visible to authorized content managers"}</small></span>
              </label>
              <div className="ca-form-actions">
                {editingAnnouncementId && <button type="button" className="ca-button ca-button-quiet" onClick={resetAnnouncementForm} disabled={savingAnnouncement}>Cancel edit</button>}
                <button type="submit" className="ca-button ca-button-primary" disabled={savingAnnouncement || !canManageAnnouncements}>
                  {savingAnnouncement ? <span className="ca-spinner" /> : editingAnnouncementId ? <Save size={16} /> : <Plus size={16} />}
                  {savingAnnouncement ? "Saving…" : editingAnnouncementId ? "Save changes" : form.published ? "Publish announcement" : "Save draft"}
                </button>
              </div>
            </form>
          </section>

          <section className="ca-list-section">
            <div className="ca-list-heading"><div><span className="ca-eyebrow">NOTICE BOARD</span><h3>All announcements</h3></div><span className="ca-count-pill">{items.length} total</span></div>
            {loadingAnnouncements ? (
              <div className="ca-empty"><span className="ca-spinner" /><p>Loading announcements…</p></div>
            ) : items.length === 0 ? (
              <div className="ca-empty"><span className="ca-empty-icon"><Megaphone size={24} /></span><h4>Your notice board is clear.</h4><p>Create your first campus announcement using the form.</p></div>
            ) : (
              <div className="ca-announcement-list">
                {items.map((item) => {
                  const title = item.title || item.heading || "Campus update";
                  const body = item.body || item.description || item.message || "";
                  const date = item.date || (item.createdAt ? new Date(timestampForSort(item.createdAt)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "No date set");
                  return (
                    <article className={`ca-announcement-card ${item.published === true ? "is-published" : "is-draft"}`} key={item.id}>
                      <div className="ca-card-top"><span className={`ca-status ${item.published === true ? "is-published" : "is-draft"}`}>{item.published === true ? <Eye size={13} /> : <EyeOff size={13} />}{item.published === true ? "Published" : "Draft"}</span><span className="ca-date"><CalendarDays size={13} />{date}</span></div>
                      <h4>{title}</h4>
                      <p>{body}</p>
                      {item.link && <a href={item.link} target="_blank" rel="noreferrer">Open announcement link <ArrowUpRight size={14} /></a>}
                      <div className="ca-card-actions">
                        <button type="button" className="ca-button ca-button-quiet" onClick={() => editAnnouncement(item)} disabled={Boolean(deletingAnnouncementId)}><Pencil size={14} /> Edit</button>
                        <button type="button" className="ca-button ca-button-quiet" onClick={() => void toggleAnnouncementPublished(item)} disabled={Boolean(deletingAnnouncementId)}>{item.published === true ? <EyeOff size={14} /> : <Eye size={14} />}{item.published === true ? "Unpublish" : "Publish"}</button>
                        <button type="button" className="ca-button ca-button-danger" onClick={() => void removeAnnouncement(item)} disabled={deletingAnnouncementId === item.id}>{deletingAnnouncementId === item.id ? <span className="ca-spinner" /> : <Trash2 size={14} />}{deletingAnnouncementId === item.id ? "Deleting…" : "Delete"}</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </AdminLayout>
  );
}

function ManageEvents(p) {
  const blank = {
    title: "",
    category: "Technical",
    date: "",
    time: "09:00",
    venue: "",
    description: "",
    image: "",
    color: "lavender",
    capacity: 100,
    published: true,
    price: "Free"
  };

  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");

  const set = (key, value) => {
    setForm((old) => ({ ...old, [key]: value }));
  };

  const edit = (event) => {
    setEditing(event.id);
    setForm({ ...event });
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      await p.saveEvent({ ...form, id: editing });
      setForm(blank);
      setEditing(null);
    } catch (err) {
      setError(err.message || "Unable to save event.");
    }
  };

  const remove = async (event) => {
    setError("");

    try {
      await p.removeEvent(event.id);

      if (editing === event.id) {
        setForm(blank);
        setEditing(null);
      }
    } catch (err) {
      setError(err.message || "Unable to delete event.");
    }
  };

  return (
    <AdminLayout
      p={p}
      title="Manage events"
      subtitle="Add new events or update event details."
    >
      <div className="editor-layout">
        <form className="panel form-stack" onSubmit={submit}>
          <h2>{editing ? "Edit event" : "Create an event"}</h2>

          <label>
            Event name
            <input
              required
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
            />
          </label>

          <div className="form-row">
            <label>
              Category
              <select
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
              >
                {[
                  "Technical",
                  "Cultural",
                  "Creative",
                  "Sports",
                  "Workshop",
                  "Other"
                ].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>

            <label>
              Capacity
              <input
                type="number"
                min="1"
                required
                value={form.capacity}
                onChange={(e) =>
                  set("capacity", Number(e.target.value))
                }
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              Date
              <input
                type="date"
                required
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
              />
            </label>

            <label>
              Time
              <input
                type="time"
                value={form.time}
                onChange={(e) => set("time", e.target.value)}
              />
            </label>
          </div>

          <label>
            Venue
            <input
              required
              value={form.venue}
              onChange={(e) => set("venue", e.target.value)}
            />
          </label>

          <label>
            Description
            <textarea
              required
              rows="3"
              value={form.description}
              onChange={(e) =>
                set("description", e.target.value)
              }
            />
          </label>

          <label>
            Poster image URL
            <input
              value={form.image || ""}
              onChange={(e) => set("image", e.target.value)}
              placeholder="https://..."
            />
          </label>

          <div className="form-row">
            <label>
              Card color
              <select
                value={form.color}
                onChange={(e) => set("color", e.target.value)}
              >
                {["lavender", "peach", "mint", "pink"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>

            <label>
              Price label
              <input
                value={form.price}
                onChange={(e) => set("price", e.target.value)}
              />
            </label>
          </div>

          <label className="check-label">
            <input
              type="checkbox"
              checked={form.published !== false}
              onChange={(e) =>
                set("published", e.target.checked)
              }
            />
            Publish this event
          </label>

          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}

          <div className="button-row">
            <button className="button button-dark" type="submit">
              <Save size={16} />
              {editing ? "Save changes" : "Create event"}
            </button>

            {editing && (
              <button
                className="button button-outline"
                type="button"
                onClick={() => {
                  setForm(blank);
                  setEditing(null);
                  setError("");
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        <div className="panel">
          <div className="panel-title">
            <h2>All events</h2>
            <span>{p.events.length} total</span>
          </div>

          <div className="manage-list">
            {p.events.map((event) => (
              <div className="manage-event" key={event.id}>
                <div
                  className={`mini-art ${
                    event.color || "lavender"
                  }`}
                >
                  {event.category === "Technical"
                    ? "💻"
                    : event.category === "Cultural"
                      ? "🎸"
                      : "🎨"}
                </div>

                <div className="manage-event-info">
                  <strong>{event.title}</strong>
                  <span>
                    {formatDate(event.date)} · {event.category}
                  </span>
                  <span
                    className={
                      event.published === false
                        ? "status-draft"
                        : "status-live"
                    }
                  >
                    {event.published === false
                      ? "Draft / hidden"
                      : "Published"}
                  </span>
                </div>

                <button
                  title="Edit event"
                  className="icon-button"
                  type="button"
                  onClick={() => edit(event)}
                >
                  <Pencil size={16} />
                </button>

                <button
                  title="Delete event"
                  className="icon-button danger"
                  type="button"
                  onClick={() => remove(event)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function ContactMessagesManager(p) {
  const [filter, setFilter] = useState("All");
  const [error, setError] = useState("");

  const messages = [...(p.contactMessages || [])].filter(
    (m) =>
      filter === "All" ||
      (filter === "New"
        ? m.status !== "Reviewed"
        : m.status === "Reviewed")
  );

  const displayDate = (value) => {
    if (!value) return "Date unavailable";

    const date = value?.toDate
      ? value.toDate()
      : new Date(value);

    return Number.isNaN(date.getTime())
      ? "Date unavailable"
      : date.toLocaleString("en-IN");
  };

  const review = async (message) => {
    setError("");

    try {
      await p.markMessageRead(message.id);
    } catch (err) {
      setError(err.message || "Unable to update message.");
    }
  };

  return (
    <AdminLayout
      p={p}
      title="Student messages & issues"
      subtitle="Read messages submitted from the public Contact section."
    >
      <div className="panel">
        <div className="panel-title">
          <div>
            <h2>Contact inbox</h2>
            <span>{messages.length} messages</span>
          </div>

          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option>All</option>
            <option>New</option>
            <option>Reviewed</option>
          </select>
        </div>

        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}

        {!messages.length ? (
          <div className="empty-state">
            <Mail size={30} />
            <p>No student messages yet.</p>
          </div>
        ) : (
          <div className="student-message-list">
            {messages.map((message) => (
              <article
                className="student-message-card"
                key={message.id}
              >
                <div className="student-message-head">
                  <div>
                    <h3>{message.name}</h3>
                    <span>
                      {displayDate(message.createdAt)}
                    </span>
                  </div>

                  <span
                    className={
                      message.status === "Reviewed"
                        ? "status-live"
                        : "message-new-badge"
                    }
                  >
                    {message.status || "New"}
                  </span>
                </div>

                <div className="student-message-meta">
                  <span>
                    <strong>Phone:</strong> {message.phone}
                  </span>
                  <span>
                    <strong>Course / Year:</strong>{" "}
                    {message.course} / {message.year}
                  </span>
                  <span>
                    <strong>Roll number:</strong>{" "}
                    {message.rollNumber}
                  </span>
                </div>

                <div className="student-message-body">
                  <strong>Message to organizers</strong>
                  <p>{message.message}</p>
                </div>

                <div className="button-row">
                  <a
                    className="button button-outline"
                    href={`tel:${message.phone}`}
                  >
                    Call student
                  </a>

                  {message.status !== "Reviewed" && (
                    <button
                      className="button button-dark"
                      type="button"
                      onClick={() => review(message)}
                    >
                      Mark as reviewed
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function ContentEditor(p) {
  const [form, setForm] = useState(p.siteContent);
  const [error, setError] = useState("");

  const update = (key, value) => {
    setForm((old) => ({ ...old, [key]: value }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      await p.saveContent(form);
    } catch (err) {
      setError(
        err.message || "Unable to publish website changes."
      );
    }
  };

  const field = (label, key, type = "text") => (
    <label key={key}>
      {label}
      {type === "textarea" ? (
        <textarea
          rows="3"
          value={form[key] || ""}
          onChange={(e) => update(key, e.target.value)}
        />
      ) : (
        <input
          type={type}
          value={form[key] || ""}
          onChange={(e) => update(key, e.target.value)}
        />
      )}
    </label>
  );

  const fields = [
    ["College / fest name", "collegeName"],
    ["College description", "collegeDescription", "textarea"],
    ["Official college website URL", "collegeWebsiteUrl", "url"],
    ["Campus location", "campusLocation"],
    ["Contact email", "contactEmail", "email"],
    ["Instagram URL", "instagramUrl", "url"],
    ["Small top line", "heroEyebrow"],
    ["Main heading — first line", "heroTitleLine1"],
    ["Main heading — second line", "heroTitleLine2"],
    ["Hero description", "heroDescription", "textarea"],
    ["Main button text", "heroButton"],
    ["Text beside button", "heroNote"],
    ["Top sticker text", "heroArtTopSticker"],
    ["Badge word 1", "heroArtWord1"],
    ["Badge word 2", "heroArtWord2"],
    ["Badge caption", "heroArtCaption"],
    ["Badge year", "heroArtYear"],
    ["Bottom sticker text", "heroArtBottomSticker"],
    ["Custom hero artwork image URL", "heroArtworkUrl", "url"],
    ["Second stat value", "heroStat2Value"],
    ["Second stat label", "heroStat2Label"],
    ["Third stat value", "heroStat3Value"],
    ["Third stat label", "heroStat3Label"],
    ["First stat label", "heroStat1Label"],
    ["Events eyebrow", "eventsEyebrow"],
    ["Events heading", "eventsTitle"],
    ["Events description", "eventsDescription", "textarea"],
    ["About heading", "aboutTitle"],
    ["About description", "aboutDescription", "textarea"],
    [
      "Additional About paragraph",
      "aboutExtraDescription",
      "textarea"
    ],
    ["Contact introduction", "contactIntro", "textarea"]
  ];

  return (
    <AdminLayout
      p={p}
      title="Website editor"
      subtitle="Edit homepage text and college details."
    >
      <div className="editor-layout">
        <form className="panel form-stack" onSubmit={submit}>
          {fields.map(([label, key, type]) =>
            field(label, key, type)
          )}

          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}

          <button className="button button-dark" type="submit">
            <Save size={16} /> Publish changes
          </button>
        </form>

        <div className="panel preview-panel">
          <div className="eyebrow">LIVE PREVIEW</div>
          <h2>
            {form.heroTitleLine1} {form.heroTitleLine2}
          </h2>
          <p>{form.heroDescription}</p>
          <div className="preview-banner">
            <Sparkles size={28} />
            <strong>{form.collegeName}</strong>
          </div>
          <h3>{form.aboutTitle}</h3>
          <p>{form.aboutDescription}</p>
          <p>{form.aboutExtraDescription}</p>
        </div>
      </div>
    </AdminLayout>
  );
}

function RegistrationManager(p) {
  const [filter, setFilter] = useState("All");
  const [error, setError] = useState("");
  const [syncingStats, setSyncingStats] = useState(false);

  // Rebuild the public homepage totals from the organizer-only registration list.
  // This also backfills registrations created before publicStats was introduced.
  const syncHomepageStats = async () => {
    setError("");
    setSyncingStats(true);
    try {
      const confirmed = p.registrations.filter(
        (registration) => (registration.status || "confirmed") === "confirmed"
      );
      const participantKeys = new Set();
      confirmed.forEach((registration) => {
        const uid = String(registration.uid || "").trim();
        const email = String(registration.emailLower || registration.email || "").trim().toLowerCase();
        const rollNumber = String(registration.rollNumber || "").trim().toLowerCase();
        const key = uid
          ? `uid:${uid}`
          : email
            ? `email:${email}`
            : rollNumber
              ? `roll:${rollNumber}`
              : `registration:${registration.id}`;
        participantKeys.add(key);
      });

      await setDoc(doc(db, "publicStats", "overview"), {
        totalRegistrations: confirmed.length,
        totalParticipants: participantKeys.size,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (err) {
      setError(err.message || "Could not sync homepage statistics. Check Firestore rules and try again.");
    } finally {
      setSyncingStats(false);
    }
  };

  const visible = p.registrations.filter(
    (r) => filter === "All" || r.eventTitle === filter
  );

  const downloadCsv = () => {
    const cols = [
      "Student name",
      "Email",
      "Phone",
      "Roll Number / PIN Number",
      "Course",
      "Year",
      "Event",
      "Pass ID",
      "Status",
      "Registered at"
    ];

    const rows = visible.map((r) => [
      r.name,
      r.email,
      r.phone,
      r.rollNumber,
      r.course,
      r.year,
      r.eventTitle,
      r.passId,
      r.status,
      r.createdAt?.toDate
        ? r.createdAt.toDate().toISOString()
        : r.createdAt
    ]);

    const csv = [cols, ...rows]
      .map((row) =>
        row
          .map(
            (v) =>
              `"${String(v ?? "").replaceAll('"', '""')}"`
          )
          .join(",")
      )
      .join("\r\n");

    const url = URL.createObjectURL(
      new Blob([csv], {
        type: "text/csv;charset=utf-8;"
      })
    );

    const a = document.createElement("a");
    a.href = url;
    a.download = "college-event-registrations.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const removeRegistration = async (registration) => {
    setError("");

    try {
      await p.deleteRegistration(registration);
    } catch (err) {
      setError(
        err.message || "Could not delete registration."
      );
    }
  };

  return (
    <AdminLayout
      p={p}
      title="Student registrations"
      subtitle="Private organizer-only view of student registration details."
    >
      <div className="panel">
        <div className="panel-title">
          <div>
            <h2>Registered students</h2>
            <span>{visible.length} records</span>
          </div>

          <div className="button-row">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option>All</option>
              {[
                ...new Set(
                  p.registrations
                    .map((r) => r.eventTitle)
                    .filter(Boolean)
                )
              ].map((title) => (
                <option key={title}>{title}</option>
              ))}
            </select>

            <button
              className="button button-outline"
              type="button"
              onClick={syncHomepageStats}
              disabled={syncingStats}
              title="Recount confirmed registrations and unique participants for the homepage"
            >
              <Save size={16} /> {syncingStats ? "Syncing counts…" : "Sync Homepage Counts"}
            </button>
            <button
              className="button button-dark"
              type="button"
              onClick={downloadCsv}
            >
              <Download size={16} /> Export CSV
            </button>
          </div>
        </div>

        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}

        {!visible.length ? (
          <div className="empty-state">
            <Users size={30} />
            <p>No registrations yet.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Roll Number / PIN</th>
                  <th>Course / Year</th>
                  <th>Event</th>
                  <th>Pass ID</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {visible.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.email}</td>
                    <td>{r.phone || "—"}</td>
                    <td>{r.rollNumber || "—"}</td>
                    <td>
                      {[r.course, r.year]
                        .filter(Boolean)
                        .join(" / ") || "—"}
                    </td>
                    <td>{r.eventTitle}</td>
                    <td>
                      <code>{r.passId}</code>
                    </td>
                    <td>
                      <span className="status-live">
                        {r.status || "confirmed"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="icon-button danger"
                        type="button"
                        onClick={() => removeRegistration(r)}
                        aria-label="Delete registration"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function RegistrationPage(p) {
  const navigate = useNavigate();
  const event = p.events.find(
    (item) => item.id === p.eventId
  );

  const [form, setForm] = useState({
    name: p.user?.displayName || "",
    email: p.user?.email || "",
    phone: "",
    rollNumber: "",
    course: "",
    year: ""
  });

  const [error, setError] = useState("");
  const [done, setDone] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const draftKey = `fest-registration-draft:${p.eventId}`;
    try {
      const savedDraft = sessionStorage.getItem(draftKey);
      if (savedDraft) {
        const parsedDraft = JSON.parse(savedDraft);
        setForm((old) => ({
          ...old,
          ...parsedDraft,
          name: p.user?.displayName || parsedDraft.name || old.name || "",
          email: p.user?.email || parsedDraft.email || old.email || ""
        }));
        sessionStorage.removeItem(draftKey);
      }
    } catch (error) {
      console.info("Could not restore the registration draft:", error);
    }

    if (p.user) {
      setForm((old) => ({
        ...old,
        name: old.name || p.user.displayName || "",
        email: old.email || p.user.email || ""
      }));
    }
  }, [p.eventId, p.user?.uid]);

  const update = (key, value) => {
    setForm((old) => ({ ...old, [key]: value }));
  };

  if (!event) {
    return (
      <div className="app-shell">
        <SiteHeader />
        <div className="auth-card">
          <h1>Event not found</h1>
          <Link to="/">Return home</Link>
        </div>
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    if (!p.user && !(import.meta.env.VITE_DEMO_MODE === "true" || !firebaseConfigured)) {
      try {
        sessionStorage.setItem(`fest-registration-draft:${event.id}`, JSON.stringify(form));
      } catch (storageError) {
        console.info("Could not save registration draft before sign-in:", storageError);
      }
      navigate(`/student-login?next=${encodeURIComponent(`/register/${event.id}`)}`);
      return;
    }

    setSubmitting(true);
    try {
      const registration = await p.registerForEvent(event, form);
      setDone(registration);
    } catch (err) {
      const message = String(err?.message || "");
      if (err?.code === "permission-denied" || /missing or insufficient permissions/i.test(message)) {
        setError("Firestore is blocking student registrations. Add and publish the registrations rules from the supplied firestore-registration-rules.txt, then try again.");
      } else {
        setError(message || "Registration failed. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="auth-shell">
        <SiteHeader />

        <div className="auth-card pass-success">
          <div className="auth-icon success-icon">
            <CheckCircle2 size={30} />
          </div>

          <div className="eyebrow">
            REGISTRATION CONFIRMED
          </div>

          <h1>
            You're on the list, {done.name.split(" ")[0]}!
          </h1>

          <p>Your event pass is ready.</p>

          <DigitalPass
            event={event}
            registration={done}
          />

          <div className="button-row">
            <button
              className="button button-dark"
              onClick={() => downloadPassPdf(event, done)}
            >
              <Download size={16} /> Download pass PDF
            </button>

            <Link
              className="button button-outline"
              to={`/pass/${done.id}`}
            >
              View pass
            </Link>
          </div>

          <Link className="back-link" to="/">
            Back to events
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <SiteHeader user={p.user} isOrganizer={p.isOrganizer} logout={p.logout} />

      <div className="auth-card wide">
        <div className="eyebrow">SAVE YOUR SPOT</div>
        <h1>Register for {event.title}</h1>
        <p>
          Enter your details carefully. Your event pass is linked
          to your registration.
        </p>

        <div className="event-summary">
          <div
            className={`mini-art ${
              event.color || "lavender"
            }`}
          >
            🎟️
          </div>
          <div>
            <strong>{event.title}</strong>
            <span>
              {formatDate(event.date)} · {event.time} ·{" "}
              {event.venue}
            </span>
          </div>
        </div>

        <form className="form-stack" onSubmit={submit}>
          <label>
            Full name
            <input
              required
              minLength="2"
              value={form.name}
              onChange={(e) =>
                update("name", e.target.value)
              }
            />
          </label>

          <label>
            Email address
            <input
              required
              type="email"
              value={form.email}
              onChange={(e) =>
                update("email", e.target.value)
              }
            />
          </label>

          <label>
            Phone number
            <input
              type="tel"
              value={form.phone}
              onChange={(e) =>
                update("phone", e.target.value)
              }
            />
          </label>

          <label>
            Roll Number / PIN Number
            <input
              required
              value={form.rollNumber}
              onChange={(e) =>
                update("rollNumber", e.target.value)
              }
            />
          </label>

          <div className="form-row">
            <label>
              Course / department
              <input
                value={form.course}
                onChange={(e) =>
                  update("course", e.target.value)
                }
              />
            </label>

            <label>
              Year of study
              <select
                value={form.year}
                onChange={(e) =>
                  update("year", e.target.value)
                }
              >
                <option value="">Select year</option>
                {[
                  "1st year",
                  "2nd year",
                  "3rd year",
                  "4th year",
                  "Other"
                ].map((year) => (
                  <option key={year}>{year}</option>
                ))}
              </select>
            </label>
          </div>

          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}

          <button
            className="button button-dark full"
            type="submit"
            disabled={submitting}
          >
            {submitting ? "Creating your event pass…" : "Confirm registration"} <ArrowUpRight size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}

function DigitalPass({ event, registration }) {
  const emoji =
    event.category === "Technical"
      ? "💻"
      : event.category === "Cultural"
        ? "🎸"
        : event.category === "Sports"
          ? "🏆"
          : "🎨";

  return (
    <div
      className={`digital-pass ${
        event.color || "lavender"
      }`}
    >
      <div className="pass-top">
        <span>✳ CAMPUS FEST</span>
        <span className="pass-status">CONFIRMED</span>
      </div>

      <div className="pass-main">
        <div className="pass-symbol">{emoji}</div>
        <div className="pass-kicker">
          YOUR OFFICIAL EVENT PASS
        </div>
        <h2>{event.title}</h2>
        <p>{event.description}</p>
      </div>

      <div className="pass-details">
        <div>
          <span>DATE & TIME</span>
          <strong>
            {formatDate(event.date)} · {event.time || "TBA"}
          </strong>
        </div>
        <div>
          <span>VENUE</span>
          <strong>{event.venue || "TBA"}</strong>
        </div>
        <div>
          <span>REGISTERED STUDENT</span>
          <strong>{registration.name}</strong>
        </div>
        <div>
          <span>ROLL NUMBER / PIN</span>
          <strong>{registration.rollNumber || "—"}</strong>
        </div>
        <div>
          <span>PASS ID</span>
          <strong>{registration.passId}</strong>
        </div>
      </div>

      <div className="pass-bottom">
        <span>Keep this pass for event check-in</span>
        <span>✦ FEST CLUB</span>
      </div>
    </div>
  );
}

function PassPage(p) {
  const localRegistration = p.registrations.find(
    (item) => item.id === p.registrationId
  ) || null;
  const isDemo = import.meta.env.VITE_DEMO_MODE === "true" || !firebaseConfigured;
  const [remoteRegistration, setRemoteRegistration] = useState(localRegistration);
  const [loading, setLoading] = useState(!localRegistration && !isDemo);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (localRegistration) {
      setRemoteRegistration(localRegistration);
      setLoading(false);
      setLoadError("");
      return undefined;
    }

    if (isDemo) {
      setRemoteRegistration(null);
      setLoading(false);
      return undefined;
    }

    if (!p.user?.uid) {
      setRemoteRegistration(null);
      setLoading(false);
      setLoadError("Sign in with the student account used for this registration to view this pass.");
      return undefined;
    }

    let active = true;
    setLoading(true);
    setLoadError("");
    getDoc(doc(db, "registrations", p.registrationId))
      .then((snapshot) => {
        if (!active) return;
        if (snapshot.exists()) {
          setRemoteRegistration({ id: snapshot.id, ...snapshot.data() });
        } else {
          setRemoteRegistration(null);
          setLoadError("This pass was not found. It may have been removed.");
        }
      })
      .catch((error) => {
        if (!active) return;
        console.info("Unable to fetch digital pass:", error.message);
        setRemoteRegistration(null);
        setLoadError("This pass is private to the student account that registered. Please sign in with that account and make sure the registration Firestore rules are published.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [p.registrationId, p.user?.uid, isDemo, localRegistration?.id]);

  const registration = remoteRegistration || localRegistration;
  const event = registration
    ? p.events.find((item) => item.id === registration.eventId) || {
        title: registration.eventTitle || "Campus event",
        date: registration.eventDate || "",
        time: registration.eventTime || "",
        venue: registration.eventVenue || "",
        description: registration.eventDescription || "",
        color: registration.eventColor || "lavender",
        category: registration.eventCategory || "Event"
      }
    : null;

  if (loading) {
    return (
      <div className="auth-shell">
        <SiteHeader user={p.user} isOrganizer={p.isOrganizer} logout={p.logout} />
        <div className="auth-card wide pass-loading-card">
          <div className="auth-icon success-icon"><Ticket size={28} /></div>
          <div className="eyebrow">YOUR DIGITAL EVENT PASS</div>
          <h1>Finding your pass…</h1>
          <p>Checking your registration securely.</p>
          <div className="pass-loading-bar" aria-hidden="true"><span /></div>
        </div>
      </div>
    );
  }

  if (!registration || !event) {
    const next = `/pass/${p.registrationId}`;
    return (
      <div className="auth-shell">
        <SiteHeader user={p.user} isOrganizer={p.isOrganizer} logout={p.logout} />
        <div className="auth-card pass-not-found-card">
          <div className="auth-icon"><Ticket size={28} /></div>
          <div className="eyebrow">DIGITAL EVENT PASS</div>
          <h1>We couldn't open this pass.</h1>
          <p>{loadError || "Open this pass from your registration confirmation or My Passes."}</p>
          {!p.user && <Link className="button button-dark full" to={`/student-login?next=${encodeURIComponent(next)}`}>Student sign in <ArrowUpRight size={16} /></Link>}
          <Link className="button button-outline full" to="/my-registrations">Go to My Passes</Link>
          <Link className="back-link" to="/">Back to events</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell pass-page-shell">
      <SiteHeader user={p.user} isOrganizer={p.isOrganizer} logout={p.logout} />
      <div className="auth-card wide pass-page-card">
        <div className="pass-page-confetti" aria-hidden="true"><span>✦</span><span>✳</span><span>✧</span><span>✦</span></div>
        <div className="auth-icon success-icon"><CheckCircle2 size={28} /></div>
        <div className="eyebrow">REGISTRATION CONFIRMED</div>
        <h1>Your campus moment is booked.</h1>
        <p>Keep this digital pass ready for event check-in.</p>
        <DigitalPass event={event} registration={registration} />
        <div className="button-row pass-actions">
          <button className="button button-dark" onClick={() => downloadPassPdf(event, registration)}><Download size={17} /> Download PDF pass</button>
          <Link className="button button-outline" to="/my-registrations">My Passes</Link>
        </div>
        <Link className="back-link" to="/">Explore more events</Link>
      </div>
    </div>
  );
}

function MyRegistrations(p) {
  const [email, setEmail] = useState(p.user?.email || "");
  const [found, setFound] = useState(false);
  const [remoteRegistrations, setRemoteRegistrations] = useState([]);
  const [remoteError, setRemoteError] = useState("");

  useEffect(() => {
    if (!firebaseConfigured || !p.user?.uid) {
      setRemoteRegistrations([]);
      setRemoteError("");
      return undefined;
    }

    const applySnapshot = (snapshot) => {
      setRemoteRegistrations(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      setRemoteError("");
    };
    const handleError = (error) => {
      console.info("Student pass lookup could not read registrations:", error.message);
      setRemoteError("Your account is signed in, but Firestore rules do not yet allow the account to read its own registrations. Publish the supplied registrations rules and try again.");
    };

    // This query matches the security rule: a student may read documents where uid == their UID.
    return onSnapshot(
      query(collection(db, "registrations"), where("uid", "==", p.user.uid)),
      applySnapshot,
      handleError
    );
  }, [p.user?.uid, p.user?.email]);

  const sourceRegistrations = remoteRegistrations.length ? remoteRegistrations : p.registrations;
  const matches = sourceRegistrations.filter(
    (r) =>
      r.email?.toLowerCase() ===
      email.toLowerCase().trim()
  );

  return (
    <div className="app-shell">
      <SiteHeader />

      <div className="my-regs">
        <div className="eyebrow">
          YOUR CAMPUS MEMORIES
        </div>

        <h1>Find your passes.</h1>

        <p>
          {p.user ? `Signed in as ${p.user.email}. We’ll look for passes linked to your account.` : "Sign in with the verified student account used to register. Your passes are private to that account."}
        </p>
        {!p.user && !(import.meta.env.VITE_DEMO_MODE === "true" || !firebaseConfigured) && (
          <Link className="button button-dark" to={`/student-login?next=${encodeURIComponent("/my-registrations")}`}>Student sign in <ArrowUpRight size={16} /></Link>
        )}
        {remoteError && <div className="error" role="alert">{remoteError}</div>}

        <form
          className="search-box my-reg-search"
          onSubmit={(e) => {
            e.preventDefault();
            setFound(true);
          }}
        >
          <Mail size={17} />

          <input
            type="email"
            required
            placeholder="Your registration email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setFound(false);
            }}
          />

          <button className="button button-dark">
            Find passes
          </button>
        </form>

        {found && (
          <div className="pass-list">
            {matches.map((r) => {
              const event = p.events.find(
                (item) => item.id === r.eventId
              ) || {
                title: r.eventTitle,
                date: "",
                time: "",
                venue: "",
                description: "",
                color: "lavender",
                category: "Event"
              };

              return (
                <div className="panel" key={r.id}>
                  <h3>{event.title}</h3>
                  <p>
                    {formatDate(event.date)} · {event.venue}
                  </p>

                  <div className="button-row">
                    <Link
                      className="button button-dark"
                      to={`/pass/${r.id}`}
                    >
                      View pass
                    </Link>

                    <button
                      className="button button-outline"
                      onClick={() =>
                        downloadPassPdf(event, r)
                      }
                    >
                      Download PDF
                    </button>
                  </div>
                </div>
              );
            })}

            {matches.length === 0 && (
              <div className="empty-state">
                No matching registrations found on this device.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
