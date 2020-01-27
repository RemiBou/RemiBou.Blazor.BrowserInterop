/// <reference types="Cypress" />

context('window.navigator', () => {
    before(() => {
        cy.visit('/navigator')
    })

    // https://on.cypress.io/interacting-with-elements

    it('Check window.navigator properties', () => {
        cy.window().then(w => {
            cy.get("#navigator-app-code-name").should('have.text', w.navigator.appCodeName);
            cy.get("#navigator-app-name").should('have.text', w.navigator.appName);
            cy.get("#navigator-app-version").should('have.text', w.navigator.appVersion);
            cy.get("#navigator-cookieEnabled").should('have.text', w.navigator.cookieEnabled.toString());
            cy.get("#navigator-hardwareConcurrency").should('have.text', w.navigator.hardwareConcurrency.toString());
            cy.get("#navigator-javaEnabled").should('have.text', w.navigator.javaEnabled().toString());
            cy.get("#navigator-language").should('have.text', w.navigator.language);
            w.navigator.languages.forEach(lang => {
                cy.get("#navigator-languages li[lang='" + lang + "']").should("exist");
            });
            cy.get("#navigator-maxTouchPoints").should('have.text', w.navigator.maxTouchPoints.toString());

            cy.get("#navigator-online").should('have.text', w.navigator.onLine.toString());
            cy.get("#navigator-platform").should('have.text', w.navigator.platform);
            cy.get("#navigator-userAgent").should('have.text', w.navigator.userAgent);

        });
    });
    it('Check window.navigator.connection properties', () => {
        cy.window().then(w => {
            cy.get("#navigator-connection-downlink").should('have.text', w.navigator.connection.downlink.toString());
            cy.get("#navigator-connection-effectiveType").should('have.text', w.navigator.connection.effectiveType.toString());
            cy.get("#navigator-connection-rtt").should('have.text', w.navigator.connection.rtt.toString());
            cy.get("#navigator-connection-saveData").should('have.text', w.navigator.connection.saveData.toString());
            cy.get("#navigator-connection-type").should('have.text', w.navigator.connection.type ? w.navigator.connection.type : '');
            cy.get("#navigator-connection-event-change-handled").should('have.text', '0').then(() => {
                w.navigator.connection.dispatchEvent(new Event("change"));
                cy.get("#navigator-connection-event-change-handled").should('have.text', '1').then(() => {
                    cy.get("#navigator-connection-event-change-stop").click().then(() => {
                        w.navigator.connection.dispatchEvent(new Event("change"));
                        cy.get("#navigator-connection-event-change-handled").should('have.text', '1');
                    });
                });
            });
        });
    });
    it('Check non standard properties', () => {
        cy.window().then(w => {
            if ('downlinkMax' in w.navigator.connection) {// this property is not available in every browser
                cy.get("#navigator-connection-downlinkmax").should('have.text', w.navigator.connection.downlinkMax.toString());
            }
            if ('buildID' in w.navigator) {
                cy.get("#navigator-build-id").should('have.text', w.navigator.buildID);
            }
        });
    });
    it('Check navigator plugins', () => {
        cy.window().then(w => {
            for (let index = 0; index < w.navigator.plugins.length; index++) {
                const element = w.navigator.plugins[index];
                cy.get("#navigator-plugins li[filename='" + element.filename + "']").should("exist");

            }
        });
    });
    it('Check navigator mimeTypes', () => {
        cy.window().then(w => {
            for (let index = 0; index < w.navigator.mimeTypes.length; index++) {
                const element = w.navigator.mimeTypes[index];
                cy.get("#navigator-mimeTypes li[mime='" + element.type + "']").should("exist");
            }
        });
    });
    it('Check navigator battery', () => {
        cy.window().then(w => {
            cy.wrap(w.navigator.getBattery()).then(function (battery) {

                cy.get("#navigator-battery-charging").should('have.text', battery.charging.toString());
                cy.get("#navigator-battery-chargingTime").should('have.text', battery.chargingTime.toString());
                cy.get("#navigator-battery-dischargingTime").should('have.text', battery.dischargingTime.toString());
                cy.get("#navigator-battery-level").should('have.text', battery.level.toString());
            });
        });
    });
})