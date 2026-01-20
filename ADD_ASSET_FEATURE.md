# New Feature: Add Asset Page

I have added a dedicated page for adding new assets to the system.

## Changes Made:

1.  **Created `AddAsset.jsx`**:
    *   A clean, user-friendly form to input all asset details.
    *   Fields included: **Miczon ID, Device Name, Category, Specifications, Department, Status, and Remarks**.
    *   Includes validation to ensure required fields (ID, Name) are present.
    *   Success/Error feedback via snackbars.

2.  **Updated `App.jsx`**:
    *   Added a new "Add Asset" tab to the main navigation bar.
    *   Placed it conveniently between "Dashboard" and "Assign Asset".
    *   Added the necessary routing logic.

3.  **UI Cleanup**:
    *   Removed the double arrows from the filter dropdowns in the Dashboard as requested.

## To Use:
1.  Click on the new **"Add Asset"** tab in the top navigation.
2.  Fill in the asset details.
3.  Click **"Save Asset"**.
4.  The new asset will immediately appear in the Dashboard.

*Note: To assign a Custodian to a new asset, please use the **"Assign Asset"** tab after creating the asset. This ensures proper assignment history is generated.*
