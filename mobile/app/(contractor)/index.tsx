import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, useTheme } from 'react-native-paper';
import { router, useFocusEffect } from 'expo-router';
import { workspace, useApp } from '../../src/providers/AppProvider';
import { canOpenModule } from '../../src/core/navigation';
import type { Dashboard } from '../../src/core/contracts';
import type { Workspace } from '../../src/core/workspace';
import { activeProjects, indiaDate } from '../../src/core/dashboardPresentation';
import { ApiError } from '../../src/core/api';
import { demoDashboard } from '../../src/data/demo';
import { DashboardSkeleton, DemoLabel, State } from '../../src/components/ui';
import { BrandHeader, IllustratedBanner, MetricTile, IllustratedActionTile, ScheduleRow, DashboardSectionTitle } from '../../src/components/ApprovedDashboard';
import type { ArtKind } from '../../src/assets/Illustrations';

export default function Home() {
  const { user, demo, menuReady, disabledMenus, menuError, loadMenus } = useApp(); const theme=useTheme();
  const [data,setData]=useState<Dashboard|null>(demo?demoDashboard:null),[extra,setExtra]=useState<Workspace|null>(null),[busy,setBusy]=useState(!demo),[error,setError]=useState('');
  const alive=useRef(true),inFlight=useRef(false);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const load=useCallback(async(force=false)=>{
    if(demo){setData(demoDashboard);setBusy(false);return;}
    if(!user||inFlight.current)return;
    inFlight.current=true;setBusy(true);setError('');
    try{const result=await workspace.load(user.id,force);if(alive.current){setData(result.dashboard);setExtra(result);}}
    catch(e){if(alive.current)setError(e instanceof ApiError&&e.status===0?'Offline · Check your connection and retry.':e instanceof Error?e.message:'Could not load your workspace.');}
    finally{inFlight.current=false;if(alive.current)setBusy(false);}
  },[demo,user?.id]);
  useFocusEffect(useCallback(()=>{void load();},[load]));
  const allowed=(id:string)=>!!user&&menuReady&&canOpenModule(user,id,disabledMenus);
  const open=(module:string)=>router.push({pathname:'/module/[module]',params:{module}});
  const today=indiaDate();
  const visits=(data?.site_visits||[]).filter(v=>v.scheduled_date===today&&['SCHEDULED','RESCHEDULED'].includes(v.status));
  const work=(extra?.schedules||[]).filter(v=>['CONFIRMED','IN_PROGRESS'].includes(v.status)&&v.start_date<=today&&v.end_date>=today);
  const name=extra?.profile?.owner_name||user?.first_name||data?.contractor_name||'there';
  const active=demo?12:extra?.schedules?activeProjects(extra.schedules):null;
  const actions:[string,string,ArtKind][]=[['customers','Add Customer','customers'],['quotations','Create Quotation','quotations'],['measurements','Measurements','measurements'],['schedules','Schedule Work','schedules'],['payments','Record Payment','payments'],['messages','Messages','messages']];
  return <SafeAreaView edges={['top','left','right']} style={{flex:1,backgroundColor:theme.colors.surface}}>
    <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={busy&&!!data} onRefresh={()=>void load(true)} tintColor={theme.colors.primary}/>}>
      <BrandHeader avatar={extra?.avatar||null} onProfile={()=>open('settings')} onNotifications={()=>Alert.alert('Notifications',`${data?.counts.unread_messages||0} unread messages\n${data?.counts.new_requests||0} new service requests\n${data?.counts.due_tasks||0} overdue follow-ups`)}/>
      <View style={s.greeting}><Text accessibilityRole="header" style={[s.title,{color:theme.colors.onSurface}]}>Namaste, {name} <Text style={{fontSize:17}}>👋</Text></Text><Text style={[s.subtitle,{color:theme.colors.onSurfaceVariant}]}>Let's build more beautiful spaces today.</Text></View>
      {!!error&&<State title={data?'Could not refresh · showing saved data':'Let’s reconnect'} description={error} action="Retry" onAction={()=>void load(true)}/>}
      {!!menuError&&<State title="Your tools are unavailable" description={menuError} action="Retry" onAction={()=>void loadMenus()}/>}
      {!data&&busy&&<DashboardSkeleton/>}
      {data&&<>
        <IllustratedBanner visits={visits.length} quotations={data.counts.quotations} onPress={allowed('schedules')?()=>open('schedules'):undefined}/>
        <View style={s.metrics}>{([
          ['customers','Customers',data.counts.customers,'Connected customers','customers'],
          ['quotations','Quotations',data.counts.quotations,'All workspace quotations','quotations'],
          ['projects','Active Projects',active,active===null?'Pull down to retry':'Confirmed & in progress','schedules'],
          ['followups','Overdue Follow-ups',data.counts.due_tasks,data.counts.due_tasks?'Need your attention':'All caught up','customers'],
        ] as const).filter(row=>allowed(row[4])).map(([kind,label,value,hint,module])=><View key={kind} style={s.half}><MetricTile kind={kind} label={label} value={value} hint={hint} onPress={()=>open(module)}/></View>)}</View>
        {!!extra?.scheduleError&&<Text accessibilityLiveRegion="polite" style={{fontSize:11,color:theme.colors.error}}>{extra.scheduleError}</Text>}
        <View><DashboardSectionTitle title="Quick Actions" action="See All" onPress={()=>router.push('/quick-actions')}/><View style={s.actions}>{actions.filter(([id])=>allowed(id)).map(([id,label,kind])=><View key={id} style={s.third}><IllustratedActionTile kind={kind} label={label} onPress={()=>open(id)}/></View>)}</View></View>
        {allowed('schedules')&&<View><DashboardSectionTitle title="Today's Schedule" action="View All" onPress={()=>open('schedules')}/><View style={{gap:8}}>{visits.slice(0,4).map(v=><ScheduleRow key={v.id} time={v.scheduled_time?new Date(`2000-01-01T${v.scheduled_time}`).toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit'}):'Time TBD'} title={v.property_name||v.customer_name} detail={`Site visit · ${v.customer_name}`} onPress={()=>open('schedules')}/>)}{work.slice(0,Math.max(0,4-visits.length)).map(v=><ScheduleRow key={`work-${v.id}`} time="Today" title={v.property} detail={`${v.start_date===today?'Work starts':'Scheduled work'} · ${v.customer}`} onPress={()=>open('schedules')}/>)}{!visits.length&&!work.length&&<View style={[s.empty,{backgroundColor:theme.colors.surfaceVariant}]}><Text style={{fontSize:12,color:theme.colors.onSurfaceVariant}}>No visits or work scheduled today.</Text><Text style={{fontSize:10,color:theme.colors.onSurfaceVariant,marginTop:4}}>Your next scheduled commitments appear here.</Text></View>}</View></View>}
        <DemoLabel/>
      </>}
    </ScrollView>
  </SafeAreaView>;
}
const s=StyleSheet.create({content:{padding:14,paddingBottom:20,gap:7},greeting:{gap:4,paddingBottom:2},title:{fontSize:19,fontFamily:'Manrope_700Bold',letterSpacing:-.4},subtitle:{fontSize:11},metrics:{flexDirection:'row',flexWrap:'wrap',gap:8},half:{width:'48%',flexGrow:1},actions:{flexDirection:'row',flexWrap:'wrap',gap:8},third:{width:'30%',flexGrow:1,maxWidth:'34%'},empty:{padding:15,borderRadius:12}});
