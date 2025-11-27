
/**
 * Icon Mappings: SF Symbols (iOS) to Material Icons (Android/Web)
 * 
 * This file provides a reference for mapping iOS SF Symbol names to Material Icon names.
 * Use this when implementing IconSymbol components throughout the app.
 * 
 * IMPORTANT: All Material Icon names must exist in @expo/vector-icons/MaterialIcons
 * Verify icon names at: https://icons.expo.fyi/Index/MaterialIcons
 */

export const iconMappings = {
  // Navigation & UI
  'house': 'home',
  'house.fill': 'home',
  'chevron.left': 'chevron_left',
  'chevron.right': 'chevron_right',
  'chevron.up': 'expand_less',
  'chevron.down': 'expand_more',
  'xmark': 'close',
  'xmark.circle': 'cancel',
  'xmark.circle.fill': 'cancel',
  'plus': 'add',
  'plus.circle': 'add_circle_outline',
  'plus.circle.fill': 'add_circle',
  'minus': 'remove',
  'checkmark': 'check',
  'checkmark.circle': 'check_circle_outline',
  'checkmark.circle.fill': 'check_circle',
  'arrow.left': 'arrow_back',
  'arrow.right': 'arrow_forward',
  'arrow.up': 'arrow_upward',
  'arrow.down': 'arrow_downward',
  
  // Actions
  'pencil': 'edit',
  'trash': 'delete',
  'doc.on.doc': 'content_copy',
  'square.and.arrow.down': 'download',
  'square.and.arrow.up': 'upload',
  'square.and.arrow.up.fill': 'share',
  'arrow.clockwise': 'sync',
  'arrow.counterclockwise': 'undo',
  'arrow.right.square': 'exit_to_app',
  
  // Content & Text
  'text.alignleft': 'format_align_left',
  'text.aligncenter': 'format_align_center',
  'text.alignright': 'format_align_right',
  'doc.text': 'description',
  'doc.text.fill': 'description',
  'square.grid.3x3': 'apps',
  'list.bullet': 'list',
  'checklist': 'checklist',
  
  // Calendar & Time
  'calendar': 'calendar_today',
  'calendar.badge.clock': 'event',
  'calendar.badge.plus': 'event',
  'calendar.badge.exclamationmark': 'event_busy',
  'clock': 'access_time',
  'clock.fill': 'schedule',
  
  // Location
  'mappin': 'place',
  'mappin.circle': 'location_on',
  'mappin.circle.fill': 'location_on',
  
  // Communication
  'bell': 'notifications_none',
  'bell.fill': 'notifications',
  'phone': 'phone',
  'phone.fill': 'phone',
  'envelope': 'email',
  'envelope.fill': 'email',
  
  // Media
  'photo': 'photo',
  'photo.fill': 'photo',
  'camera': 'camera_alt',
  'camera.fill': 'camera_alt',
  
  // User & Profile
  'person': 'person',
  'person.fill': 'person',
  'person.circle': 'account_circle',
  'person.circle.fill': 'account_circle',
  
  // Settings & Tools
  'gearshape': 'settings',
  'gearshape.fill': 'settings',
  'slider.horizontal.3': 'tune',
  'line.3.horizontal.decrease.circle': 'filter_list',
  
  // Status & Info
  'info.circle': 'info',
  'info.circle.fill': 'info',
  'exclamationmark.triangle': 'warning',
  'exclamationmark.triangle.fill': 'warning',
  'exclamationmark.circle': 'error',
  'exclamationmark.circle.fill': 'error',
  'shield.checkmark.fill': 'verified_user',
  
  // Search & Navigation
  'magnifyingglass': 'search',
  
  // Sports & Performance
  'trophy': 'emoji_events',
  'trophy.fill': 'emoji_events',
  
  // Selection
  'square': 'check_box_outline_blank',
  'checkmark.square': 'check_box',
  'checkmark.square.fill': 'check_box',
  
  // Tags & Labels
  'tag': 'label_outline',
  'tag.fill': 'label',
  
  // Charts & Analytics
  'chart.bar': 'bar_chart',
  'chart.bar.fill': 'bar_chart',
};

/**
 * Get the Material Icon name for a given SF Symbol name
 * @param sfSymbolName - The SF Symbol name (iOS)
 * @returns The corresponding Material Icon name, or 'help_outline' if not found
 */
export function getMaterialIconName(sfSymbolName: string): string {
  const mapped = iconMappings[sfSymbolName as keyof typeof iconMappings];
  if (!mapped) {
    console.warn(`⚠️ No Material Icon mapping found for SF Symbol: "${sfSymbolName}". Using fallback icon.`);
  }
  return mapped || 'help_outline';
}
