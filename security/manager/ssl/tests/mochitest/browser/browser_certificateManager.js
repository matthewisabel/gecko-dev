/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const TEST_CERT_BASE64 =
  "MIICrjCCAZagAwIBAgIUe5lVOMkAlJoPQkmZ7fbJgzf2GqQwDQYJKoZIhvcNAQEEBQAwDTELMAkGA1UEAwwCY2EwIhgPMjAxODExMjcwMDAwMDBaGA8yMDIxMDIwNDAwMDAwMFowETEPMA0GA1UEAwwGbWQ1LWVlMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuohRqESOFtZB/W62iAY2ED08E9nq5DVKtOz1aFdsJHvBxyWo4NgfvbGcBptuGobya+KvWnVramRxCHqlWqdFh/cc1SScAn7NQ/weadA4ICmTqyDDSeTbuUzCa2wO7RWCD/F+rWkasdMCOosqQe6ncOAPDY39ZgsrsCSSpH25iGF5kLFXkD3SO8XguEgfqDfTiEPvJxbYVbdmWqp+ApAvOnsQgAYkzBxsl62WYVu34pYSwHUxowyR3bTK9/ytHSXTCe+5Fw6naOGzey8ib2njtIqVYR3uJtYlnauRCE42yxwkBCy/Fosv5fGPmRcxuLP+SSP6clHEMdUDrNoYCjXtjQIDAQABMA0GCSqGSIb3DQEBBAUAA4IBAQCYTPM+SoIBQ6eGd95zKrfbd0mvgDmLML/gkiGrgyw8Q1nyYzjlXP6WTf+5FoFgOxWwKYaqAa3uDoNgN5TaapxC9WQB0gE4JKbughSbNZb+MsiAYVciPlHBVkrjU4YcRus2J/J/fkx6v+PFohY99LZNi2IgUwhnt15CnWLIXb8FUlN/pjRVq8J2AKD2uj7I3SkBB3gQ9c7ELtvn6z22zMgAYA5uKVKyUjXKX4A67hZUoash6APIl0qQQiQKQLuwJ8nKYo3scrQ8DXdSiF99ufjrYY+bXgV8i7EnvX+qj2CELKw3xtkqOgeBTAR2dOw03LiiYKwWUydtXtRyKHRHoLze";

async function checkServerCertificates(win, expectedValues = []) {
  await TestUtils.waitForCondition(() => {
    return (
      win.document.getElementById("serverList").itemChildren.length ==
      expectedValues.length
    );
  }, `Expected to have ${expectedValues.length} but got ${win.document.getElementById("serverList").itemChildren.length}`);

  let labels = win.document
    .getElementById("serverList")
    .querySelectorAll("label");

  expectedValues.forEach((item, i) => {
    let hostPort = labels[i * 3].value;
    let certString = labels[i * 3 + 1].value || labels[i * 3 + 1].textContent;
    let isTemporaryString =
      labels[i * 3 + 2].value || labels[i * 3 + 2].textContent;

    Assert.equal(
      hostPort,
      item.hostPort,
      `Expected override to be ${item.hostPort} but got ${hostPort}`
    );

    Assert.equal(
      certString,
      item.certName,
      `Expected override to have field ${item.certName}`
    );

    Assert.equal(
      isTemporaryString,
      item.isTemporary ? "Temporary" : "Permanent",
      `Expected override to be ${item.isTemporary ? "Temporary" : "Permanent"}`
    );
  });
}

async function deleteOverride(win, expectedLength) {
  win.document.getElementById("serverList").selectedIndex = 0;
  await TestUtils.waitForCondition(() => {
    return (
      win.document.getElementById("serverList").itemChildren.length ==
      expectedLength
    );
  });
  let newWinPromise = BrowserTestUtils.domWindowOpenedAndLoaded();
  // Since the .click() blocks we need to dispatch it to the main thread avoid that.
  Services.tm.dispatchToMainThread(() =>
    win.document.getElementById("websites_deleteButton").click()
  );
  let newWin = await newWinPromise;
  newWin.document.getElementById("deleteCertificate").acceptDialog();
  Assert.equal(
    win.document.getElementById("serverList").selectedIndex,
    0,
    "After deletion we expect the selectedItem to be reset."
  );
}

async function testViewButton(win) {
  win.document.getElementById("serverList").selectedIndex = 1;

  Assert.ok(
    win.document.getElementById("websites_viewButton").disabled,
    "View button should be disabled for override without cert"
  );

  win.document.getElementById("serverList").selectedIndex = 0;

  Assert.ok(
    !win.document.getElementById("websites_viewButton").disabled,
    "View button should be enabled for override with cert"
  );

  let loaded = BrowserTestUtils.waitForNewTab(gBrowser, null, true);

  win.document.getElementById("websites_viewButton").click();

  let newTab = await loaded;
  let spec = newTab.linkedBrowser.documentURI.spec;

  Assert.ok(
    spec.startsWith("about:certificate"),
    "about:certificate should habe been opened"
  );

  let newUrl = new URL(spec);
  let certEncoded = newUrl.searchParams.get("cert");
  let certDecoded = decodeURIComponent(certEncoded);
  Assert.equal(
    TEST_CERT_BASE64,
    certDecoded,
    "Loaded cert should match expected cert"
  );

  gBrowser.removeCurrentTab();
}

add_task(async function test_cert_manager_server_tab() {
  let win = await openCertManager();

  await checkServerCertificates(win);

  win.document.getElementById("certmanager").acceptDialog();
  await BrowserTestUtils.windowClosed(win);

  let cert = await readCertificate("md5-ee.pem", ",,");
  let certOverrideService = Cc[
    "@mozilla.org/security/certoverride;1"
  ].getService(Ci.nsICertOverrideService);
  certOverrideService.rememberValidityOverride(
    "example.com",
    443,
    cert,
    Ci.nsICertOverrideService.ERROR_UNTRUSTED,
    false
  );

  win = await openCertManager();

  await checkServerCertificates(win, [
    {
      hostPort: "example.com:443",
      certName: "md5-ee",
      isTemporary: false,
    },
  ]);

  win.document.getElementById("certmanager").acceptDialog();
  await BrowserTestUtils.windowClosed(win);

  certOverrideService.rememberTemporaryValidityOverrideUsingFingerprint(
    "example.com",
    9999,
    "40:20:3E:57:FB:82:95:0D:3F:62:D7:04:39:F6:32:CC:B2:2F:70:9F:3E:66:C5:35:64:6E:49:2A:F1:02:75:9F",
    Ci.nsICertOverrideService.ERROR_UNTRUSTED
  );

  win = await openCertManager();

  await checkServerCertificates(win, [
    {
      hostPort: "example.com:443",
      certName: "md5-ee",
      isTemporary: false,
    },
    {
      hostPort: "example.com:9999",
      certName: "(Not Stored)",
      isTemporary: true,
    },
  ]);

  await testViewButton(win);

  await deleteOverride(win, 2);

  await checkServerCertificates(win, [
    {
      hostPort: "example.com:9999",
      certName: "(Not Stored)",
      isTemporary: true,
    },
  ]);

  win.document.getElementById("certmanager").acceptDialog();
  await BrowserTestUtils.windowClosed(win);

  certOverrideService.clearAllOverrides();
});
