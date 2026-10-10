// USD estimates only. Unknown prices remain null, never silently free.
export function estimateParking(tags, info, hours = 3) {
  if (
    ["private", "no"].includes(tags.access) ||
    ["private", "no"].includes(tags.hgv) ||
    tags.motor_vehicle === "no" ||
    tags.motorcar === "no"
  )
    return {
      amount: null,
      detail:
        "Current map tags restrict access to this lot. Confirm with the host before planning parking.",
    };
  if (
    info?.scope === "Great Park policy proposal" ||
    info?.scope === "Shopping-center visitor guidance"
  )
    return { amount: null, detail: info.detail, sourceURL: info.url };
  if (
    info?.status === "published" &&
    info.scope === "Campus visitor permit guidance"
  )
    return {
      amount: 16,
      detail:
        "Published general visitor day permit estimate. This is not a confirmed truck/vendor permit fee.",
      sourceURL: info.url,
      rateCheckedAt: info.checkedAt,
    };
  const match = String(tags.charge || "")
    .trim()
    .replace(/^\$(\d+(?:\.\d+)?)/, "$1 USD")
    .match(
      /^(?:USD\s*|\$\s*)?(\d+(?:\.\d+)?)\s*(?:USD|\$)(?:\s*\/\s*(hour|h|day))?$/i,
    );
  if (match) {
    const rate = Number(match[1]);
    return {
      amount:
        Math.round(
          rate *
            (["h", "hour"].includes(match[2]?.toLowerCase()) ? hours : 1) *
            100,
        ) / 100,
      detail:
        "Community-mapped USD charge estimate; truck eligibility and current operator rate are unverified.",
    };
  }
  if (tags.fee === "no")
    return {
      amount: 0,
      detail:
        "Community map marks parking as free. This is an estimate; current truck/vendor fees are unverified.",
    };
  return {
    amount: null,
    detail:
      "No usable lot-specific USD rate is available. Enter the host’s parking quote.",
  };
}
