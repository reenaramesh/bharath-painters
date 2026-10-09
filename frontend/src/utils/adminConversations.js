export function groupAdminConversations(messages = [], search = '') {
  const contractors = new Map();
  for (const message of messages) {
    const key = String(message.contractor_id ?? message.contractor ?? 'Unknown contractor');
    if (!contractors.has(key)) contractors.set(key, {id:key,name:message.contractor || 'Unknown contractor',threads:[],latest:null});
    const contractor = contractors.get(key);
    let thread = contractor.threads.find(item => item.id === message.conversation);
    if (!thread) {
      thread = {id:message.conversation,name:message.customer || 'Participant',bharathId:message.customer_bharath_id,messages:[]};
      contractor.threads.push(thread);
    }
    thread.messages.push(message);
  }
  const timestamp = message => Date.parse(message?.created_at) || 0;
  const term = search.trim().toLowerCase();
  return [...contractors.values()].map(contractor => {
    contractor.threads.forEach(thread => {
      thread.messages.sort((a,b) => timestamp(a)-timestamp(b) || a.id-b.id);
      thread.latest=thread.messages.at(-1);
    });
    contractor.threads.sort((a,b) => timestamp(b.latest)-timestamp(a.latest));
    contractor.latest=contractor.threads[0]?.latest;
    return contractor;
  }).filter(contractor => !term || [contractor.name,...contractor.threads.flatMap(thread => [thread.name,thread.bharathId,...thread.messages.flatMap(message => [message.sender,message.text])])].some(value => String(value || '').toLowerCase().includes(term)))
    .sort((a,b) => timestamp(b.latest)-timestamp(a.latest));
}
