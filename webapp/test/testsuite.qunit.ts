/* global window, parent, location */
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/ban-ts-comment, no-var */

// @ts-nocheck
window.suite = function () {
  var oSuite = new parent.jsUnitTestSuite(),
    sContextPath = location.pathname.substring(
      0,
      location.pathname.lastIndexOf('/') + 1,
    );

  oSuite.addTestPage(sContextPath + 'unit/unitTests.qunit.html');
  oSuite.addTestPage(sContextPath + 'integration/opaTests.qunit.html');

  return oSuite;
};
