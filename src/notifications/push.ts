export type PushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

export type PushTicket = {
  token: string;
  status: "ok" | "error";
  id?: string;
  message?: string;
};

export type PushProviderName = "expo" | "log";

function isExpoToken(token: string): boolean {
  return (
    token.startsWith("ExponentPushToken[") ||
    token.startsWith("ExpoPushToken[")
  );
}

async function sendViaExpo(
  messages: PushMessage[],
  accessToken?: string
): Promise<PushTicket[]> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate",
    "Content-Type": "application/json",
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers,
    body: JSON.stringify(
      messages.map((message) => ({
        to: message.to,
        title: message.title,
        body: message.body,
        data: message.data ?? {},
        sound: "default",
      }))
    ),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Expo push HTTP ${response.status}: ${text.slice(0, 200)}`);
  }

  const payload = (await response.json()) as {
    data?: Array<{
      status: string;
      id?: string;
      message?: string;
      details?: { error?: string };
    }>;
  };

  const tickets = payload.data ?? [];
  return messages.map((message, index) => {
    const ticket = tickets[index];
    if (!ticket) {
      return {
        token: message.to,
        status: "error" as const,
        message: "Missing Expo ticket",
      };
    }
    if (ticket.status === "ok") {
      return {
        token: message.to,
        status: "ok" as const,
        id: ticket.id,
      };
    }
    return {
      token: message.to,
      status: "error" as const,
      message: ticket.message ?? ticket.details?.error ?? "Expo push failed",
    };
  });
}

function sendViaLog(messages: PushMessage[]): PushTicket[] {
  return messages.map((message) => {
    console.info(
      `[push:log] to=${message.to.slice(0, 24)}… title=${message.title} body=${message.body}`
    );
    return {
      token: message.to,
      status: "ok" as const,
      id: `log-${Date.now()}`,
    };
  });
}

/**
 * Deliver push messages.
 * Expo tokens go to Expo's HTTP API; anything else (or empty provider config)
 * is logged so local/dev still records a successful simulated send.
 */
export async function sendPushMessages(
  messages: PushMessage[],
  options: { accessToken?: string; forceLog?: boolean } = {}
): Promise<{ provider: PushProviderName; tickets: PushTicket[] }> {
  if (messages.length === 0) {
    return { provider: "log", tickets: [] };
  }

  if (options.forceLog) {
    return { provider: "log", tickets: sendViaLog(messages) };
  }

  const expoMessages = messages.filter((m) => isExpoToken(m.to));
  const otherMessages = messages.filter((m) => !isExpoToken(m.to));

  const tickets: PushTicket[] = [];
  let provider: PushProviderName = "log";

  if (expoMessages.length > 0) {
    provider = "expo";
    tickets.push(...(await sendViaExpo(expoMessages, options.accessToken)));
  }

  if (otherMessages.length > 0) {
    tickets.push(...sendViaLog(otherMessages));
  }

  return { provider, tickets };
}
