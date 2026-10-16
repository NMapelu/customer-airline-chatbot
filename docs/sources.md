# Kenya Airways (KQ) Policy Reference

This document lists the official Kenya Airways policy pages used to build the RAG knowledge base for the customer service chatbot.

## Legal & Contractual Policies

- **Conditions of Carriage (Full Contract)**
  URL: https://www.kenya-airways.com/en/policies/conditions-of-carriage/
  Description: Legally binding rules covering schedules, cancellations, denied boarding, and liability.

- **Conditions of Carriage (Baggage Specific)**
  URL: https://www.kenya-airways.com/en/plan/baggage-information/conditions-of-carriage-baggage/#main-content
  Description: Specific articles on baggage acceptance, prohibited items, and liability.

- **Privacy Policy**
  URL: https://www.kenya-airways.com/en-sl/kqapp-menu-items/privacy-policy/
  Description: Data handling, marketing preferences, and consent for automated communications.

## Baggage Policies

- **Baggage Allowance**
  URL: https://www.kenya-airways.com/en-sl/plan/baggage-information/baggage-allowance/
  Description: Free checked baggage limits by route/cabin, frequent flyer benefits, and pooling rules.

- **Delayed, Lost, or Damaged Baggage**
  URL: https://www.kenya-airways.com/en-ci/plan/baggage-information/delayed-baggage/
  Description: Reporting process, First Needs Allowance, and liability limits.

- **Pet Carriage**
  URL: https://www.kenya-airways.com/en-gb/plan/baggage-information/pet-carriage/
  Description: Live animals (cargo only), service dog rules, and emotional support animal policy.

## Ticketing, Refunds & Changes

- **Refund Request Form & Policy**
  URL: https://www.kenya-airways.com/en-gb/book-manage/manage-booking/request-for-your-refund/
  Description: Official refund request form and processing timeline (21-30 business days).

- **Self Rebooking Service (FAQs)**
  URL: https://www.kenya-airways.com/contentassets/827bb627582b4582a8331d5a4b1ef714/self-rebooking-faqs-info-.pdf
  Description: Rules for the free self-service rebooking tool.

- **Paid Seat Terms & Conditions**
  URL: https://www.kenya-airways.com/en-sc/experience/seat-selection/bid-terms-and-conditions/
  Description: Bidding rules, refund conditions, and exemptions for special passengers.

## Check-in & Boarding

- **Check-in Policy**
  URL: https://www.kenya-airways.com/en-sd/book-manage/post-booking/check-in/
  Description: Online check-in windows and airport counter closure times.

## Special Assistance & Accessibility

- **Special Travel Needs (Medical)**
  URL: https://www.kenya-airways.com/uploadedFiles/Pages/Kenya/Prepare_for_Travel/Special_Assistance/special%20travel%20info.pdf
  Description: MEDIF form requirements, oxygen provision, and medical clearance.

- **Unaccompanied Minors (UMNR)**
  URL: https://www.kenya-airways.com/en/plan/special-care/unaccompanied-minors/
  Description: Age rules (5-15) and booking requirements for unaccompanied minors.
  (Fixed 2026-10-16: the old link pointed to a Martyrs' Day promotion page.)

- **KQ Ezesha Accessibility Program**
  URL: https://www.kenya-airways.com/en/plan/special-care/reduced-mobility/kq-ezesha-program/
  Description: Discounts for passengers with disabilities and their carers.

- **Pride of Africa Service Charter**
  URL: https://www.kenya-airways.com/uploadedFiles/Content/Footer_Content/The%20Pride%20of%20Africa%20Service%20Charter%20.pdf
  Description: Comprehensive service standards for check-in, baggage, and special assistance.

## Added 2026-10-16 (gaps from overview §9.1)

- **Contact Us / Customer Help** (required: the escalation answer quotes its phone numbers)
  URL: https://www.kenya-airways.com/en/help/customer-help/
  URL: https://www.kenya-airways.com/en-us/contact/
  Description: Official contact channels. Phone numbers must come only from these pages, never from third-party sites.

- **Customer Service Plan**
  URL: https://www.kenya-airways.com/en/policies/customer-service-plan/
  Description: KQ's published service commitments (delays, cancellations, refunds).

- **Asante Rewards**
  URL: https://asante.kenya-airways.com/
  URL: https://asante.kenya-airways.com/pages/earnings
  Description: Loyalty programme tiers, earning and redeeming miles.

- **Travel Requirements (documents, visas, health)**
  URL: https://www.kenya-airways.com/en/plan/travel-information/travel-requirements/
  Description: Passport, visa and health document requirements.

- **Travel Insurance**
  No official KQ page found on 2026-10-16. Until one is found, the chatbot treats this as out of scope and refers customers to KQ contact channels.

## Not fetched yet

`docs/sources.json` is the list the fetch script uses. These pages are left out of it for now:

- **Pride of Africa Service Charter:** the PDF link redirects to the home page, and no replacement has been found.
- **Customer Help** and both **Asante Rewards** pages: their text is rendered by JavaScript, so a plain download gets an empty page.
- **Travel insurance:** KQ has no page for it, so the chatbot treats it as out of scope.
