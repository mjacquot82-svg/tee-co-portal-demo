# Deferred UX findings

These findings were recorded during production acceptance testing and are intentionally deferred until the complete customer and admin business workflows have been validated.

## Customer order request handoff

The current two-stage workflow is intentional: `/order-preview` saves a pending selection and transfers the customer to `/portal/request-order`; the order is created only when the authenticated request form is submitted.

Deferred improvements:

- The public preview action and authenticated final action both use “Submit Order Request,” obscuring that the first action is only a portal handoff.
- “Order Preview,” “Order Summary,” “Order Total,” and “Final decorated catalog pricing” make the public preview appear to be the final submission step.
- Copy referring to review “before submitting” and details confirmed “after submission” reinforces that interpretation.
- The restored-draft banner does not clearly state that the authenticated form still needs to be submitted.
- Consider distinct action labels, explicit handoff copy, a short progress indicator, and “Estimated Total” terminology during the later UX redesign.

No workflow, screen, or navigation redesign is authorized during the current acceptance-testing phase unless a Critical issue prevents completion.
