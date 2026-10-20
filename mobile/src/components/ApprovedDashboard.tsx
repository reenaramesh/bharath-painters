import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text, useTheme } from 'react-native-paper';
import { HouseLogo, IllustratedIcon, PainterScene, artColors, type ArtKind } from '../assets/Illustrations';
const blue = '#0074FF', navy = '#081A4B';
export function BrandHeader({ avatar, onProfile, onNotifications }: { avatar: string | null; onProfile: () => void; onNotifications: () => void }) {
  const theme = useTheme();
  return <View style={s.header}><HouseLogo/><Text style={[s.brand,{color:theme.dark?theme.colors.onSurface:navy}]}>Bharath Apps</Text><Pressable accessibilityRole="button" accessibilityLabel="Notifications" onPress={onNotifications} style={s.iconButton}><Icon source="bell-outline" size={21} color={theme.colors.onSurface}/></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Your profile and settings" onPress={onProfile} style={s.iconButton}>{avatar?<Image source={{uri:avatar}} style={s.avatar}/>:<View style={[s.avatar,s.avatarFallback]}><Icon source="account" size={24} color={navy}/></View>}</Pressable></View>;
}
export function IllustratedBanner({ visits, quotations, onPress }: { visits: number; quotations: number; onPress?: () => void }) {
  return <Pressable accessibilityRole={onPress?'button':undefined} accessibilityLabel={`${visits} site visits today. ${quotations} quotations in your workspace.`} onPress={onPress} style={s.banner}><View style={StyleSheet.absoluteFill}><PainterScene/></View><View style={s.bannerCopy}><Text style={s.bannerTitle}>{visits} Site Visit{visits===1?'':'s'} Today</Text><Text style={s.bannerNumber}>{quotations} Quotation{quotations===1?'':'s'}</Text><Text style={s.bannerHint}>In your workspace</Text></View></Pressable>;
}
export function MetricTile({ kind, label, value, hint, onPress }: { kind: ArtKind; label: string; value: number | null; hint: string; onPress?: () => void }) {
  const theme=useTheme();
  return <Pressable accessibilityRole={onPress?'button':undefined} accessibilityLabel={`${label}: ${value??'Unavailable'}. ${hint}`} onPress={onPress} style={[s.metric,{backgroundColor:theme.colors.surface,borderColor:theme.colors.outlineVariant}]}><IllustratedIcon kind={kind} size={46}/><View style={s.flex}><Text style={[s.metricLabel,{color:theme.colors.onSurfaceVariant}]}>{label}</Text><Text style={[s.metricValue,{color:kind==='followups'?'#F84942':theme.colors.onSurface}]}>{value??'—'}</Text><Text style={[s.metricHint,{color:kind==='followups'?'#F84942':theme.colors.onSurfaceVariant}]}>{hint}</Text></View></Pressable>;
}
export function IllustratedActionTile({ kind, label, onPress }: { kind: ArtKind; label: string; onPress: () => void }) {
  const theme=useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[s.action,{backgroundColor:theme.dark?theme.colors.surfaceVariant:artColors[kind][0]+'80'}]}><IllustratedIcon kind={kind} size={48}/><Text style={[s.actionText,{color:theme.colors.onSurface}]}>{label}</Text></Pressable>;
}
export function ScheduleRow({ time, title, detail, onPress, image }: { time: string; title: string; detail: string; onPress: () => void; image?: string }) {
  const theme=useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={`${time}. ${title}. ${detail}`} onPress={onPress} style={[s.schedule,{backgroundColor:theme.colors.surface,borderColor:theme.colors.outlineVariant}]}><View style={s.scheduleStripe}/><Text style={[s.time,{color:theme.colors.onSurface}]}>{time}</Text>{image?<Image source={{uri:image}} style={s.thumbnail}/>:<View style={[s.thumbnail,s.avatarFallback]}><HouseLogo size={30}/></View>}<View style={s.flex}><Text style={[s.scheduleTitle,{color:theme.colors.onSurface}]}>{title}</Text><Text style={[s.scheduleHint,{color:theme.colors.onSurfaceVariant}]}>{detail}</Text></View><Icon source="map-marker" color={blue} size={21}/></Pressable>;
}
export function DashboardSectionTitle({ title, action, onPress }: {title:string;action:string;onPress:()=>void}) {
  const theme=useTheme();
  return <View style={s.sectionHead}><Text accessibilityRole="header" style={[s.sectionTitle,{color:theme.colors.onSurface}]}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel={`${action}: ${title}`} onPress={onPress} style={s.sectionAction}><Text style={{fontSize:11,fontFamily:'Manrope_600SemiBold',color:theme.colors.primary}}>{action} ›</Text></Pressable></View>;
}
const s=StyleSheet.create({
  flex:{flex:1,minWidth:0},header:{flexDirection:'row',alignItems:'center',minHeight:48,gap:6},brand:{fontSize:21,fontFamily:'Manrope_700Bold',flex:1,letterSpacing:-.8},iconButton:{minWidth:48,minHeight:48,alignItems:'center',justifyContent:'center'},avatar:{width:34,height:34,borderRadius:17},avatarFallback:{backgroundColor:'#E2F0FF',alignItems:'center',justifyContent:'center'},
  banner:{height:120,borderRadius:16,overflow:'hidden',backgroundColor:blue},bannerCopy:{padding:14,width:'57%',gap:4},bannerTitle:{fontSize:18,fontFamily:'Manrope_700Bold',color:'white'},bannerNumber:{fontSize:16,fontFamily:'Manrope_600SemiBold',color:'white'},bannerHint:{fontSize:11,color:'#EDF7FF'},
  metric:{flexDirection:'row',alignItems:'center',gap:5,minHeight:66,padding:7,borderRadius:13,borderWidth:1,boxShadow:'0px 2px 5px rgba(12,54,106,0.04)'},metricLabel:{fontSize:10,fontFamily:'Manrope_600SemiBold'},metricValue:{fontSize:18,lineHeight:23,fontFamily:'Manrope_700Bold'},metricHint:{fontSize:9,lineHeight:13},
  action:{minHeight:74,padding:6,borderRadius:13,alignItems:'center',justifyContent:'center',gap:4},actionText:{fontSize:11,lineHeight:14,fontFamily:'Manrope_600SemiBold',textAlign:'center'},
  sectionHead:{flexDirection:'row',alignItems:'center',minHeight:48},sectionTitle:{flex:1,fontSize:14,fontFamily:'Manrope_700Bold'},sectionAction:{minHeight:48,minWidth:56,justifyContent:'center',alignItems:'flex-end'},
  schedule:{minHeight:68,flexDirection:'row',gap:8,alignItems:'center',borderWidth:1,borderRadius:12,padding:8,overflow:'hidden'},scheduleStripe:{position:'absolute',left:0,top:9,bottom:9,width:2,backgroundColor:'#FF4843'},time:{width:53,fontSize:10,fontFamily:'Manrope_700Bold'},thumbnail:{width:36,height:42,borderRadius:6},scheduleTitle:{fontSize:11,fontFamily:'Manrope_700Bold'},scheduleHint:{fontSize:9,lineHeight:14,marginTop:3},
});
