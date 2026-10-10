import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateParking } from "./parking-price.mjs";
test("fee estimates respect service duration, currency and unknown rates", () => {
  assert.equal(estimateParking({ charge: "5 USD/hour" }, null, 3).amount, 15);
  assert.equal(estimateParking({ charge: "$5/day" }, null, 3).amount, 5);
  assert.equal(estimateParking({ charge: "5 EUR/hour" }).amount, null);
  assert.equal(estimateParking({ fee: "yes" }).amount, null);
  assert.equal(estimateParking({ fee: "no" }).amount, 0);
  assert.equal(
    estimateParking(
      { fee: "no" },
      { scope: "Great Park policy proposal", detail: "Unconfirmed" },
    ).amount,
    null,
  );
  assert.equal(
    estimateParking(
      {},
      { status: "published", scope: "Campus visitor permit guidance" },
    ).amount,
    16,
  );
});
