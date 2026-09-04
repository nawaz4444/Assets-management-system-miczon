export const navItems = [
  { path: '/', label: 'Dashboard', icon: 'grid' },
  { path: '/inventory', label: 'Inventory', icon: 'box' },
  { path: '/stock', label: 'Stock', icon: 'layers' },
  { path: '/employees', label: 'Employees', icon: 'users' },
  { path: '/requests', label: 'Requests', icon: 'inbox' },
  { path: '/health-checks', label: 'Health Checks', icon: 'pulse' },
  { path: '/portal', label: 'Employee Portal', icon: 'user' },
];

export const emptyAsset = {
  miczon_id: '',
  name: '',
  super_category: '',
  category: '',
  department: '',
  current_status: 'AVAILABLE',
  custodian: '',
  purchase_date: '',
  purchase_price: '',
  specifications: '',
  remarks: '',
};

export const emptyEmployee = {
  name: '',
  employee_id: '',
  email: '',
  department: '',
};

export const assetStatuses = [
  { value: 'ASSIGNED', label: 'Assigned' },
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'BROKEN', label: 'Repair' },
  { value: 'RETIRED', label: 'Retired' },
];

export const itInspectionFields = [
  {
    name: 'screen_condition',
    label: 'Screen Condition',
    defaultValue: 'GOOD',
    options: [
      { value: 'EXCELLENT', label: 'Excellent' },
      { value: 'GOOD', label: 'Good' },
      { value: 'SCRATCHED', label: 'Scratched' },
      { value: 'CRACKED', label: 'Cracked' },
      { value: 'NEEDS_REPAIR', label: 'Needs Repair' },
      { value: 'NOT_APPLICABLE', label: 'Not Applicable (N/A)' },
    ],
  },
  {
    name: 'battery_life',
    label: 'Battery Life',
    defaultValue: 'GOOD',
    options: [
      { value: 'EXCELLENT', label: 'Excellent' },
      { value: 'GOOD', label: 'Good' },
      { value: 'FAIR', label: 'Fair' },
      { value: 'POOR', label: 'Poor' },
      { value: 'NOT_APPLICABLE', label: 'Not Applicable (N/A)' },
    ],
  },
  {
    name: 'physical_condition',
    label: 'Physical Condition',
    defaultValue: 'GOOD_MINOR_WEAR',
    options: [
      { value: 'EXCELLENT', label: 'Excellent' },
      { value: 'GOOD_MINOR_WEAR', label: 'Good (Minor wear)' },
      { value: 'FAIR_SCRATCHES_DENTS', label: 'Fair (Noticeable scratches/dents)' },
      { value: 'POOR_CRACKED_BROKEN', label: 'Poor (Cracked/Broken)' },
    ],
  },
  {
    name: 'power_boot_status',
    label: 'Power & Boot Status',
    defaultValue: 'BOOTS_NORMALLY',
    options: [
      { value: 'BOOTS_NORMALLY', label: 'Boots normally' },
      { value: 'SLOW_TO_BOOT', label: 'Slow to boot' },
      { value: 'POWERS_NO_DISPLAY_OS', label: 'Powers on but no display/OS' },
      { value: 'DOES_NOT_POWER_ON', label: 'Does not power on' },
    ],
  },
  {
    name: 'ports_connectors',
    label: 'Ports & Connectors',
    defaultValue: 'ALL_FUNCTIONAL',
    options: [
      { value: 'ALL_FUNCTIONAL', label: 'All functional' },
      { value: 'LOOSE_CONNECTIONS', label: 'Loose connections' },
      { value: 'VISIBLY_DAMAGED', label: 'Visibly damaged' },
      { value: 'UNRESPONSIVE', label: 'Unresponsive' },
    ],
  },
  {
    name: 'network_functionality',
    label: 'Network Functionality',
    defaultValue: 'CONNECTS_NORMALLY',
    options: [
      { value: 'CONNECTS_NORMALLY', label: 'Connects normally' },
      { value: 'INTERMITTENT_CONNECTION', label: 'Intermittent connection' },
      { value: 'FAILS_TO_CONNECT', label: 'Fails to connect' },
    ],
  },
  {
    name: 'asset_tag_status',
    label: 'Asset Tag Status',
    defaultValue: 'INTACT_SCANNABLE',
    options: [
      { value: 'INTACT_SCANNABLE', label: 'Intact & Scannable' },
      { value: 'FADED_PEELING', label: 'Faded/Peeling' },
      { value: 'MISSING', label: 'Missing' },
    ],
  },
];

export const furnitureInspectionFields = [
  {
    name: 'surface_finish',
    label: 'Surface Finish & Scratches',
    defaultValue: 'EXCELLENT',
    options: [
      { value: 'EXCELLENT', label: 'Excellent (No Scratches)' },
      { value: 'GOOD_MINOR_SCRATCHES', label: 'Good (Minor Scratches)' },
      { value: 'STAINED_DISCOLORED', label: 'Stained / Discolored' },
      { value: 'SEVERELY_DAMAGED', label: 'Severely Damaged / Chipped' },
    ],
  },
  {
    name: 'structural_stability',
    label: 'Structural Stability & Joints',
    defaultValue: 'SOLID_STABLE',
    options: [
      { value: 'SOLID_STABLE', label: 'Solid & Stable' },
      { value: 'MINOR_WOBBLE', label: 'Minor Wobble' },
      { value: 'LOOSE_JOINTS_SCREWS', label: 'Loose Joints / Screws' },
      { value: 'UNSTABLE_REPAIR_NEEDED', label: 'Unstable / Repair Needed' },
    ],
  },
  {
    name: 'drawers_locks',
    label: 'Drawers, Slides & Locks',
    defaultValue: 'SMOOTH_FUNCTIONAL',
    options: [
      { value: 'SMOOTH_FUNCTIONAL', label: 'Smooth / Fully Functional' },
      { value: 'STIFF_STICKY', label: 'Stiff / Hard to Open' },
      { value: 'LOCK_MALFUNCTIONING', label: 'Lock Malfunctioning' },
      { value: 'NOT_APPLICABLE', label: 'Not Applicable (N/A)' },
    ],
  },
  {
    name: 'upholstery_padding',
    label: 'Upholstery & Fabric Condition',
    defaultValue: 'INTACT_CLEAN',
    options: [
      { value: 'INTACT_CLEAN', label: 'Intact & Clean' },
      { value: 'MINOR_WEAR_FADE', label: 'Minor Wear / Fading' },
      { value: 'TORN_STAINED', label: 'Torn / Stained Padding' },
      { value: 'NOT_APPLICABLE', label: 'Not Applicable (N/A)' },
    ],
  },
  {
    name: 'legs_castors_base',
    label: 'Legs, Castors & Base Support',
    defaultValue: 'ALL_INTACT',
    options: [
      { value: 'ALL_INTACT', label: 'All Intact & Smooth' },
      { value: 'MISSING_CAPS_GLIDES', label: 'Missing Caps / Glides' },
      { value: 'DAMAGED_WHEELS', label: 'Damaged Wheels / Castors' },
      { value: 'BROKEN_BASE', label: 'Broken Base / Leg' },
    ],
  },
  {
    name: 'ergonomic_adjustment',
    label: 'Height & Tilt Adjustment',
    defaultValue: 'SMOOTH_MECHANISM',
    options: [
      { value: 'SMOOTH_MECHANISM', label: 'Smooth Adjustment' },
      { value: 'STIFF_ADJUSTMENT', label: 'Stiff / Hard to Adjust' },
      { value: 'STUCK_BROKEN', label: 'Stuck / Broken Mechanism' },
      { value: 'NOT_APPLICABLE', label: 'Fixed Height (N/A)' },
    ],
  },
  {
    name: 'asset_tag_status',
    label: 'Asset Tag Status',
    defaultValue: 'INTACT_SCANNABLE',
    options: [
      { value: 'INTACT_SCANNABLE', label: 'Intact & Scannable' },
      { value: 'FADED_PEELING', label: 'Faded/Peeling' },
      { value: 'MISSING', label: 'Missing' },
    ],
  },
];

export const appliancesInspectionFields = [
  {
    name: 'cooling_heating_perf',
    label: 'Thermal / Performance Output',
    defaultValue: 'OPTIMAL_TEMP',
    options: [
      { value: 'OPTIMAL_TEMP', label: 'Optimal Temperature' },
      { value: 'SLOW_PERFORMANCE', label: 'Slow Cooling / Heating' },
      { value: 'INADEQUATE_TEMP', label: 'Inadequate Output' },
      { value: 'NOT_WORKING', label: 'Not Working / No Output' },
    ],
  },
  {
    name: 'compressor_motor_status',
    label: 'Motor / Compressor & Fan Status',
    defaultValue: 'QUIET_SMOOTH',
    options: [
      { value: 'QUIET_SMOOTH', label: 'Quiet & Smooth Operation' },
      { value: 'EXCESSIVE_NOISE', label: 'Excessive Noise / Vibration' },
      { value: 'INTERMITTENT_FAULT', label: 'Intermittent Fault' },
      { value: 'MOTOR_FAILED', label: 'Motor / Compressor Failed' },
    ],
  },
  {
    name: 'power_cord_plug',
    label: 'Power Cord & Electrical Safety',
    defaultValue: 'INTACT_SAFE',
    options: [
      { value: 'INTACT_SAFE', label: 'Intact & Safe' },
      { value: 'FRAYED_WIRE', label: 'Frayed / Worn Cable' },
      { value: 'DAMAGED_PLUG', label: 'Damaged Plug' },
      { value: 'SAFETY_HAZARD', label: 'Safety Hazard (Exposed Wire)' },
    ],
  },
  {
    name: 'filter_ventilation',
    label: 'Air Filter & Vent Condition',
    defaultValue: 'CLEAN_CLEAR',
    options: [
      { value: 'CLEAN_CLEAR', label: 'Clean & Clear' },
      { value: 'DUSTY_NEEDS_CLEANING', label: 'Dusty / Needs Cleaning' },
      { value: 'CLOGGED_FILTER', label: 'Clogged Filter' },
      { value: 'DAMAGED_VENT', label: 'Damaged Vent / Grill' },
    ],
  },
  {
    name: 'refrigerant_leak_check',
    label: 'Gas / Water Leakage Check',
    defaultValue: 'NO_LEAKS',
    options: [
      { value: 'NO_LEAKS', label: 'No Leaks Detected' },
      { value: 'MINOR_WATER_DRIP', label: 'Minor Water Drip' },
      { value: 'GAS_LEAK_SUSPECTED', label: 'Refrigerant/Gas Leak Suspected' },
      { value: 'MAJOR_LEAK', label: 'Major Leakage' },
    ],
  },
  {
    name: 'control_panel_remote',
    label: 'Control Panel & Thermostat',
    defaultValue: 'ALL_FUNCTIONAL',
    options: [
      { value: 'ALL_FUNCTIONAL', label: 'All Controls Functional' },
      { value: 'UNRESPONSIVE_DISPLAY', label: 'Unresponsive Display' },
      { value: 'THERMOSTAT_ERROR', label: 'Thermostat Error' },
      { value: 'BROKEN_SWITCHES', label: 'Broken Switches / Remote' },
    ],
  },
  {
    name: 'asset_tag_status',
    label: 'Asset Tag Status',
    defaultValue: 'INTACT_SCANNABLE',
    options: [
      { value: 'INTACT_SCANNABLE', label: 'Intact & Scannable' },
      { value: 'FADED_PEELING', label: 'Faded/Peeling' },
      { value: 'MISSING', label: 'Missing' },
    ],
  },
];

export function getInspectionFields(asset, sessionCategoryCode) {
  const code = String(asset?.super_category_code || sessionCategoryCode || 'it_assets').toLowerCase();
  if (code.includes('furniture')) return furnitureInspectionFields;
  if (code.includes('appliance')) return appliancesInspectionFields;
  return itInspectionFields;
}

export const healthInspectionFields = itInspectionFields;

export const ratingOptions = [1, 2, 3, 4, 5];

export const inventoryPageSize = 25;
