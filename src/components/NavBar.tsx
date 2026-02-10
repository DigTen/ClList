import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "../auth/AuthProvider";
import {
  dismissNotification,
  fetchNotifications,
  fetchUnreadNotificationsCount,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "../lib/data";

export function NavBar() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const notificationPanelRef = useRef<HTMLDivElement | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
      navigate("/login", { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Δεν ήταν δυνατή η αποσύνδεση.";
      toast.error(message);
    } finally {
      setIsSigningOut(false);
    }
  };

  const unreadNotificationsQuery = useQuery({
    queryKey: ["notifications-unread-count", user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => fetchUnreadNotificationsCount(user!.id),
  });

  const notificationsQuery = useQuery({
    queryKey: ["notifications", user?.id, "latest"],
    enabled: Boolean(user?.id && isNotificationPanelOpen),
    queryFn: () => fetchNotifications(user!.id, 20),
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => markNotificationAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["notifications-unread-count", user?.id] });
    },
    onError: () => {
      toast.error("Δεν ήταν δυνατή η ενημέρωση της ειδοποίησης.");
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => markAllNotificationsAsRead(user!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["notifications-unread-count", user?.id] });
      toast.success("Όλες οι ειδοποιήσεις σημειώθηκαν ως αναγνωσμένες.");
    },
    onError: () => {
      toast.error("Δεν ήταν δυνατή η μαζική ενημέρωση ειδοποιήσεων.");
    },
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) => dismissNotification(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["notifications-unread-count", user?.id] });
    },
    onError: () => {
      toast.error("Δεν ήταν δυνατή η απόρριψη της ειδοποίησης.");
    },
  });

  useEffect(() => {
    if (!isNotificationPanelOpen) {
      return;
    }

    const handleOutsideClick = (event: MouseEvent) => {
      if (!notificationPanelRef.current) {
        return;
      }
      if (notificationPanelRef.current.contains(event.target as Node)) {
        return;
      }
      setIsNotificationPanelOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsNotificationPanelOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isNotificationPanelOpen]);

  const unreadCount = unreadNotificationsQuery.data ?? 0;

  const openClientProfileFromNotification = async (notificationId: string, clientId: string | null, isRead: boolean) => {
    try {
      if (!isRead) {
        await markReadMutation.mutateAsync(notificationId);
      }
      setIsNotificationPanelOpen(false);
      if (clientId) {
        navigate(`/clients/${clientId}`);
      }
    } catch {
      // Error toast is already handled by mutation callbacks.
    }
  };

  return (
    <header className="top-nav">
      <div className="container row space-between align-center">
        <div className="row gap-md align-center">
          <h1 className="app-title">
            <Link to="/dashboard">Διαχείριση Studio Pilates</Link>
          </h1>
          <nav className="row gap-sm">
            <NavLink
              to="/calendar"
              className={({ isActive }) => (isActive ? "nav-link nav-link-active" : "nav-link")}
            >
              Ημερολόγιο
            </NavLink>
            <NavLink
              to="/payments"
              className={({ isActive }) => (isActive ? "nav-link nav-link-active" : "nav-link")}
            >
              Πληρωμές
            </NavLink>
            <NavLink
              to="/summary"
              className={({ isActive }) => (isActive ? "nav-link nav-link-active" : "nav-link")}
            >
              Σύνοψη
            </NavLink>
            <NavLink
              to="/operations"
              className={({ isActive }) => (isActive ? "nav-link nav-link-active" : "nav-link")}
            >
              Αυτοματισμοί
            </NavLink>
            <NavLink
              to="/account"
              className={({ isActive }) => (isActive ? "nav-link nav-link-active" : "nav-link")}
            >
              Λογαριασμός
            </NavLink>
          </nav>
        </div>
        <div className="row gap-sm align-center nav-actions">
          <div className="notification-wrap" ref={notificationPanelRef}>
            <button
              type="button"
              className="button notification-trigger"
              aria-label={unreadCount > 0 ? `Ειδοποιήσεις (${unreadCount} μη αναγνωσμένες)` : "Ειδοποιήσεις"}
              onClick={() => setIsNotificationPanelOpen((previous) => !previous)}
            >
              Ειδοποιήσεις
              {unreadCount > 0 ? <span className="notification-badge">{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
            </button>

            {isNotificationPanelOpen ? (
              <section className="notification-panel" role="dialog" aria-label="Κέντρο ειδοποιήσεων">
                <header className="notification-panel-header">
                  <strong>Κέντρο ειδοποιήσεων</strong>
                  <button
                    type="button"
                    className="button"
                    onClick={() => void markAllReadMutation.mutateAsync()}
                    disabled={markAllReadMutation.isPending || unreadCount === 0}
                  >
                    Σήμανση όλων ως αναγνωσμένες
                  </button>
                </header>

                {notificationsQuery.isLoading ? (
                  <p className="muted-text">Φόρτωση ειδοποιήσεων...</p>
                ) : (notificationsQuery.data ?? []).length ? (
                  <div className="notification-list">
                    {(notificationsQuery.data ?? []).map((notification) => (
                      <article
                        key={notification.id}
                        className={["notification-item", notification.is_read ? "" : "notification-item-unread"]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <button
                          type="button"
                          className="notification-main-action"
                          onClick={() =>
                            void openClientProfileFromNotification(
                              notification.id,
                              notification.client_id,
                              notification.is_read,
                            )
                          }
                        >
                          <strong>{notification.title}</strong>
                          <span>{notification.body ?? "Χωρίς λεπτομέρειες."}</span>
                          <span className="muted-text">{new Date(notification.created_at).toLocaleString("el-GR")}</span>
                        </button>
                        <div className="row gap-sm">
                          {!notification.is_read ? (
                            <button
                              type="button"
                              className="button"
                              onClick={() => void markReadMutation.mutateAsync(notification.id)}
                            >
                              Ανάγνωση
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="button"
                            onClick={() => void dismissMutation.mutateAsync(notification.id)}
                          >
                            Απόρριψη
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">Δεν υπάρχουν ειδοποιήσεις.</div>
                )}

                <footer className="notification-panel-footer">
                  <Link className="button" to="/operations" onClick={() => setIsNotificationPanelOpen(false)}>
                    Άνοιγμα Αυτοματισμών
                  </Link>
                </footer>
              </section>
            ) : null}
          </div>
          <span className="muted-text">{user?.email}</span>
          <button
            type="button"
            className="button"
            onClick={() => void handleSignOut()}
            disabled={isSigningOut}
          >
            {isSigningOut ? "Αποσύνδεση..." : "Αποσύνδεση"}
          </button>
        </div>
      </div>
    </header>
  );
}
