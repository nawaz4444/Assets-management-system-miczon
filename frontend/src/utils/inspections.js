function sessionRank(session) {
  const timestamp = Date.parse(session?.created_at || '');
  const id = Number(session?.id);
  return [Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY, Number.isFinite(id) ? id : Number.NEGATIVE_INFINITY];
}

export function latestOpenInspection(sessions = []) {
  return sessions.reduce((latest, session) => {
    if (session?.status !== 'OPEN') return latest;
    if (!latest) return session;

    const [latestTimestamp, latestId] = sessionRank(latest);
    const [timestamp, id] = sessionRank(session);
    return timestamp > latestTimestamp || (timestamp === latestTimestamp && id > latestId) ? session : latest;
  }, null);
}
