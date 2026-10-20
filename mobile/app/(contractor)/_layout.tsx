import { Tabs, router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Icon, Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../src/providers/AppProvider';
import { canOpenModule } from '../../src/core/navigation';
export default function ContractorTabs() {
  const theme=useTheme(),insets=useSafeAreaInsets();const {user,menuReady,disabledMenus}=useApp();
  const allowed=(id:string)=>!!user&&menuReady&&canOpenModule(user,id,disabledMenus);
  return <Tabs backBehavior="initialRoute" screenOptions={{headerShown:false,tabBarActiveTintColor:theme.colors.primary,tabBarInactiveTintColor:theme.colors.onSurfaceVariant,tabBarStyle:{backgroundColor:theme.colors.surface,borderTopColor:theme.colors.outlineVariant,height:64+insets.bottom,paddingTop:6,paddingBottom:insets.bottom},tabBarItemStyle:{minHeight:48},tabBarLabelStyle:{fontSize:10,fontFamily:'Manrope_600SemiBold'},tabBarHideOnKeyboard:true}}>
    <Tabs.Screen name="index" options={{title:'Home',tabBarIcon:({color})=><Icon source="home" size={24} color={color}/>}}/>
    <Tabs.Screen name="customers" options={{title:'Customers',href:allowed('customers')?undefined:null,tabBarIcon:({color})=><Icon source="account-group" size={24} color={color}/>}}/>
    <Tabs.Screen name="create" options={{title:'Create',tabBarButton:()=> <Pressable accessibilityRole="button" accessibilityLabel="Create: open quick actions" onPress={()=>router.push('/quick-actions')} style={{flex:1,minHeight:48,alignItems:'center',justifyContent:'center'}}><View style={{width:48,height:48,borderRadius:24,backgroundColor:theme.colors.primary,alignItems:'center',justifyContent:'center',marginTop:-22,borderWidth:3,borderColor:theme.colors.surface}}><Icon source="plus" size={28} color={theme.colors.onPrimary}/></View><Text style={{fontSize:10,color:theme.colors.onSurfaceVariant,marginTop:2}}>Create</Text></Pressable>}}/>
    <Tabs.Screen name="projects" options={{title:'Projects',href:allowed('projects')?undefined:null,tabBarIcon:({color})=><Icon source="clipboard-check" size={23} color={color}/>}}/>
    <Tabs.Screen name="more" options={{title:'More',tabBarIcon:({color})=><Icon source="dots-grid" size={24} color={color}/>}}/>
    <Tabs.Screen name="work" options={{href:null}}/><Tabs.Screen name="messages" options={{href:null}}/>
  </Tabs>;
}
