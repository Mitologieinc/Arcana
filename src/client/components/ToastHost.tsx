import { useEffect, useState } from "react";
import { subscribeToast } from "../lib/toast";

export function ToastHost() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let hide = 0;
    const unsub = subscribeToast((next) => {
      window.clearTimeout(hide);
      setMessage(next);
      hide = window.setTimeout(() => setMessage(null), 2200);
    });
    return () => {
      window.clearTimeout(hide);
      unsub();
    };
  }, []);

  if (!message) return null;
  return (
    <div className="arcana-toast" role="status">
      {message}
    </div>
  );
}
