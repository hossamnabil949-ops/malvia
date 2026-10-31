// طبقة التخزين: Postgres (Neon) عبر Vercel Marketplace. المتغير DATABASE_URL يُضاف تلقائياً عند ربط القاعدة.

export interface Row { data: unknown; version: number }

let ready: Promise<void> | null = null;

let client: any = null;
async function sql() {
  if (client) return client;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;
  if (!url) throw new Error('قاعدة البيانات غير مربوطة: DATABASE_URL غير موجود (اربط Neon من Storage ثم Redeploy)');
  let mod: any;
  try { mod = await import('@neondatabase/serverless'); }
  catch { throw new Error('الحزمة @neondatabase/serverless غير مثبتة: تأكد أن package.json المحدث مرفوع'); }
  client = mod.neon(url);
  return client;
}

export async function init() {
  if (!ready) {
    ready = (async () => {
      const q = await sql();
      await q`create table if not exists malvia_docs (
        tenant text not null,
        resource text not null,
        data jsonb not null,
        version bigint not null default 1,
        updated_at timestamptz not null default now(),
        primary key (tenant, resource)
      )`;
      await q`create table if not exists malvia_backups (
        id bigserial primary key,
        tenant text not null,
        kind text not null default 'auto',
        docs jsonb not null,
        size_bytes bigint not null default 0,
        created_at timestamptz not null default now()
      )`;
      await q`create index if not exists malvia_backups_tenant_idx on malvia_backups (tenant, created_at desc)`;
      await q`create table if not exists malvia_employee_sessions (
        token_hash text primary key, tenant text not null, employee_id text not null,
        created_at timestamptz not null default now(), expires_at timestamptz not null, revoked_at timestamptz
      )`;
      await q`create index if not exists malvia_employee_sessions_tenant_idx on malvia_employee_sessions (tenant, employee_id)`;
      await q`create table if not exists malvia_agent_ops (
        tenant text not null, idempotency_key text not null, result jsonb not null,
        created_at timestamptz not null default now(), primary key (tenant, idempotency_key)
      )`;
      await q`create or replace function malvia_agent_execute(p_tenant text, p_token_hash text, p_key text, p_action text, p_payload jsonb)
      returns jsonb language plpgsql as $$
      declare v_emp_id text; v_emp jsonb; v_perms jsonb; v_role text; v_existing jsonb;
        v_parts jsonb; v_invoices jsonb; v_expenses jsonb; v_suppliers jsonb; v_supplier_payments jsonb; v_purchase_invoices jsonb;
        v_customers jsonb; v_treasury jsonb; v_audit jsonb; v_moves jsonb; v_settings jsonb; v_shifts jsonb; v_part jsonb; v_supplier jsonb; v_customer jsonb;
        v_qty numeric; v_amount numeric; v_id text; v_number text; v_now timestamptz := now(); v_date text; v_time text;
        v_name text; v_method text; v_total numeric; v_stock numeric; v_invoice jsonb; v_row jsonb; v_cash boolean;
        v_balance numeric; v_result jsonb; v_permission text; v_match_count integer; v_shift_id text; v_is_credit boolean;
      begin
        perform pg_advisory_xact_lock(hashtext(p_tenant));
        select result into v_existing from malvia_agent_ops where tenant=p_tenant and idempotency_key=p_key;
        if v_existing is not null then return v_existing || jsonb_build_object('idempotentReplay', true); end if;
        select employee_id into v_emp_id from malvia_employee_sessions where token_hash=p_token_hash and tenant=p_tenant and revoked_at is null and expires_at > now();
        if v_emp_id is null then raise exception 'AGENT_UNAUTHENTICATED'; end if;
        select coalesce(data,'[]'::jsonb) into v_emp from malvia_docs where tenant=p_tenant and resource='employees';
        select e into v_emp from jsonb_array_elements(coalesce(v_emp,'[]'::jsonb)) e where e->>'id'=v_emp_id and coalesce(e->>'status','نشط') <> 'معلق' limit 1;
        if v_emp is null then raise exception 'AGENT_EMPLOYEE_DISABLED'; end if;
        v_role := coalesce(v_emp->>'role',''); v_perms := coalesce(v_emp->'permissions','{}'::jsonb);
        v_permission := case p_action when 'EXECUTE_SALE' then 'canSellPos' when 'ADD_EXPENSE' then 'canManageTreasury' when 'COLLECT_CUSTOMER' then 'canManageTreasury' when 'SETTLE_SUPPLIER' then 'canManagePurchases' when 'ADD_PURCHASE' then 'canManagePurchases' when 'RESTOCK_ITEM' then 'canManageInventory' else '' end;
        if v_permission='' then raise exception 'AGENT_ACTION_NOT_ALLOWED'; end if;
        if v_role <> 'مدير عام' and not (coalesce((v_perms->>v_permission)::boolean,false) is true or (p_action='SETTLE_SUPPLIER' and coalesce((v_perms->>'canManageTreasury')::boolean,false) is true)) then raise exception 'AGENT_PERMISSION_DENIED'; end if;
        v_date := to_char(v_now,'YYYY-MM-DD'); v_time := to_char(v_now,'HH24:MI');
        v_id := 'AI-' || upper(substr(md5(clock_timestamp()::text || random()::text),1,16));
        v_name := coalesce(v_emp->>'name','الموظف'); v_method := coalesce(p_payload->>'paymentMethod','نقدي');
        select coalesce((select data from malvia_docs where tenant=p_tenant and resource='parts'),'[]'::jsonb) into v_parts;
        select coalesce((select data from malvia_docs where tenant=p_tenant and resource='invoices'),'[]'::jsonb) into v_invoices;
        select coalesce((select data from malvia_docs where tenant=p_tenant and resource='expenses'),'[]'::jsonb) into v_expenses;
        select coalesce((select data from malvia_docs where tenant=p_tenant and resource='suppliers'),'[]'::jsonb) into v_suppliers;
        select coalesce((select data from malvia_docs where tenant=p_tenant and resource='supplierPayments'),'[]'::jsonb) into v_supplier_payments;
        select coalesce((select data from malvia_docs where tenant=p_tenant and resource='purchaseInvoices'),'[]'::jsonb) into v_purchase_invoices;
        select coalesce((select data from malvia_docs where tenant=p_tenant and resource='customers'),'[]'::jsonb) into v_customers;
        select coalesce((select data from malvia_docs where tenant=p_tenant and resource='treasury'),'[]'::jsonb) into v_treasury;
        select coalesce((select data from malvia_docs where tenant=p_tenant and resource='auditLog'),'[]'::jsonb) into v_audit;
        select coalesce((select data from malvia_docs where tenant=p_tenant and resource='stockMovements'),'[]'::jsonb) into v_moves;
        select coalesce((select data from malvia_docs where tenant=p_tenant and resource='settings'),'{}'::jsonb) into v_settings;
        select coalesce((select data from malvia_docs where tenant=p_tenant and resource='shifts'),'[]'::jsonb) into v_shifts;
        if p_action='EXECUTE_SALE' then
          if coalesce((v_settings->>'requireShiftForSales')::boolean,false) and not exists (select 1 from jsonb_array_elements(v_shifts) sh where sh->>'status'='مفتوحة') then raise exception 'AGENT_SHIFT_REQUIRED'; end if;
          v_qty := (p_payload->>'quantity')::numeric;
          if v_qty is null or v_qty <= 0 or v_qty <> trunc(v_qty) then raise exception 'AGENT_INVALID_QUANTITY'; end if;
          select e into v_part from jsonb_array_elements(v_parts) e where e->>'id'=p_payload->>'partId' limit 1;
          if v_part is null then raise exception 'AGENT_PART_NOT_FOUND'; end if;
          if coalesce(v_part->>'tracking','none') in ('batch','serial') then raise exception 'AGENT_TRACKING_REQUIRES_MANUAL'; end if;
          v_stock := coalesce((v_part->>'stockQuantity')::numeric,0);
          if v_stock < v_qty then raise exception 'AGENT_OUT_OF_STOCK'; end if;
          v_total := coalesce((v_part->>'salePrice')::numeric,0)*v_qty;
          v_is_credit := lower(v_method) like '%آجل%' or lower(v_method) like '%اجل%' or lower(v_method) like '%حساب ورشة%';
          v_customer := null;
          if coalesce(p_payload->>'customerName','عميل نقدي') <> 'عميل نقدي' then
            select count(*) into v_match_count from jsonb_array_elements(v_customers) e where lower(e->>'name')=lower(p_payload->>'customerName');
            if v_match_count > 1 then raise exception 'AGENT_CUSTOMER_AMBIGUOUS'; end if;
            select e into v_customer from jsonb_array_elements(v_customers) e where lower(e->>'name')=lower(p_payload->>'customerName') limit 1;
          end if;
          if v_is_credit and v_customer is null then raise exception 'AGENT_CUSTOMER_NOT_FOUND'; end if;
          if v_total <= 0 then raise exception 'AGENT_INVALID_PRICE'; end if;
          v_number := 'AI-'||to_char(v_now,'YYYYMMDD')||'-'||substr(v_id,4,8);
          v_invoice := jsonb_build_object('id',v_id,'invoiceNumber',v_number,'date',v_date,'time',v_time,'customerName',coalesce(p_payload->>'customerName','عميل نقدي'),'customerId',case when v_customer is not null then v_customer->>'id' else null end,'customerType',coalesce(v_customer->>'type','تجزئة'),'items',jsonb_build_array(jsonb_build_object('partId',v_part->>'id','partNumber',v_part->>'partNumber','partName',v_part->>'name','quantity',v_qty,'unitPrice',(v_part->>'salePrice')::numeric,'costPrice',coalesce((v_part->>'costPrice')::numeric,0),'total',v_total)),'subtotal',v_total,'tax',0,'discount',0,'grandTotal',v_total,'paymentMethod',v_method,'status','مسددة','cashierId',v_emp_id,'cashierName',v_name,'notes','Executed via MALVIA AI Agent');
          select jsonb_agg(case when e->>'id'=v_part->>'id' then jsonb_set(jsonb_set(e,'{stockQuantity}',to_jsonb(v_stock-v_qty),true),'{updatedAt}',to_jsonb(v_date),true) else e end) into v_parts from jsonb_array_elements(v_parts) e;
          v_invoices := jsonb_build_array(v_invoice) || v_invoices;
          if v_customer is not null then
            select jsonb_agg(case when e->>'id'=v_customer->>'id' then jsonb_set(jsonb_set(jsonb_set(jsonb_set(e,'{balance}',to_jsonb(coalesce((e->>'balance')::numeric,0)+case when v_is_credit then v_total else 0 end),true),'{totalPurchases}',to_jsonb(coalesce((e->>'totalPurchases')::numeric,0)+v_total),true),'{monthlyPurchases}',to_jsonb(coalesce((e->>'monthlyPurchases')::numeric,0)+v_total),true),'{invoicesCount}',to_jsonb(coalesce((e->>'invoicesCount')::numeric,0)+1),true),'{lastVisit}',to_jsonb(v_date),true) else e end) into v_customers from jsonb_array_elements(v_customers) e;
          end if;
          select e->>'id' into v_shift_id from jsonb_array_elements(v_shifts) e where e->>'status'='مفتوحة' order by e->>'openedAt' limit 1;
          if v_shift_id is not null then
            select jsonb_agg(case when e->>'id'=v_shift_id then jsonb_set(jsonb_set(jsonb_set(e,'{invoiceCount}',to_jsonb(coalesce((e->>'invoiceCount')::numeric,0)+1),true),'{cashSales}',to_jsonb(coalesce((e->>'cashSales')::numeric,0)+case when lower(v_method) like '%نقدي%' or lower(v_method) like '%كاش%' then v_total else 0 end),true),'{cashIn}',to_jsonb(coalesce((e->>'cashIn')::numeric,0)+case when lower(v_method) like '%نقدي%' or lower(v_method) like '%كاش%' then v_total else 0 end),true) else e end) into v_shifts from jsonb_array_elements(v_shifts) e;
          end if;
          v_moves := jsonb_build_array(jsonb_build_object('id',v_id||'-MOV','at',v_now,'partId',v_part->>'id','partNumber',v_part->>'partNumber','partName',v_part->>'name','type','sale','qtyDelta',-v_qty,'balanceAfter',v_stock-v_qty,'refId',v_id,'refNumber',v_number,'userName',v_name)) || v_moves;
          if lower(v_method) not like '%آجل%' and lower(v_method) not like '%اجل%' and lower(v_method) not like '%حساب ورشة%' then
            select coalesce(sum(case when e->>'type'='قبض' then (e->>'amount')::numeric else -((e->>'amount')::numeric) end),0) into v_balance from jsonb_array_elements(v_treasury) e;
            v_treasury := jsonb_build_array(jsonb_build_object('id',v_id||'-TX','txNumber','AI-TX-'||substr(v_id,4,8),'date',v_date,'time',v_time,'type','قبض','category','مبيعات كاشير (فواتير بيع)','amount',v_total,'paymentMethod',v_method,'balanceAfter',v_balance+v_total,'referenceId',v_id,'description','بيع عبر MALVIA AI Agent: '||coalesce(v_part->>'name','صنف'),'recordedBy',v_name,'at',v_now)) || v_treasury;
          end if;
          v_result := jsonb_build_object('success',true,'action',p_action,'operationId',v_id,'documentNumber',v_number,'amount',v_total,'message','تم حفظ فاتورة البيع على الخادم');
        elsif p_action='ADD_EXPENSE' then
          v_amount := (p_payload->>'amount')::numeric;
          if v_amount is null or v_amount<=0 then raise exception 'AGENT_INVALID_AMOUNT'; end if;
          v_number := 'EXP-AI-'||substr(v_id,4,8);
          v_row := jsonb_build_object('id',v_id,'title',coalesce(p_payload->>'title','مصروف عام'),'category','صيانة ونثريات وضيافة','amount',v_amount,'date',v_date,'paymentMethod',v_method,'notes','Executed via MALVIA AI Agent','recordedBy',v_name);
          v_expenses := jsonb_build_array(v_row)||v_expenses;
          select coalesce(sum(case when e->>'type'='قبض' then (e->>'amount')::numeric else -((e->>'amount')::numeric) end),0) into v_balance from jsonb_array_elements(v_treasury) e;
          v_treasury := jsonb_build_array(jsonb_build_object('id',v_id||'-TX','txNumber',v_number,'date',v_date,'time',v_time,'type','صرف','category','مصروفات تشغيلية','amount',v_amount,'paymentMethod',v_method,'balanceAfter',v_balance-v_amount,'referenceId',v_id,'description','مصروف عبر MALVIA AI Agent: '||coalesce(p_payload->>'title','مصروف عام'),'recordedBy',v_name,'at',v_now))||v_treasury;
          v_result := jsonb_build_object('success',true,'action',p_action,'operationId',v_id,'documentNumber',v_number,'amount',v_amount,'message','تم حفظ المصروف على الخادم');
        elsif p_action='RESTOCK_ITEM' then
          v_qty := (p_payload->>'quantity')::numeric;
          if v_qty is null or v_qty<=0 or v_qty<>trunc(v_qty) then raise exception 'AGENT_INVALID_QUANTITY'; end if;
          select e into v_part from jsonb_array_elements(v_parts) e where e->>'id'=p_payload->>'partId' limit 1;
          if v_part is null then raise exception 'AGENT_PART_NOT_FOUND'; end if;
          v_stock := coalesce((v_part->>'stockQuantity')::numeric,0);
          select jsonb_agg(case when e->>'id'=v_part->>'id' then jsonb_set(jsonb_set(e,'{stockQuantity}',to_jsonb(v_stock+v_qty),true),'{updatedAt}',to_jsonb(v_date),true) else e end) into v_parts from jsonb_array_elements(v_parts) e;
          v_moves := jsonb_build_array(jsonb_build_object('id',v_id||'-MOV','at',v_now,'partId',v_part->>'id','partNumber',v_part->>'partNumber','partName',v_part->>'name','type','adjustment','qtyDelta',v_qty,'balanceAfter',v_stock+v_qty,'refId',v_id,'refNumber',v_id,'userName',v_name))||v_moves;
          v_result := jsonb_build_object('success',true,'action',p_action,'operationId',v_id,'documentNumber',v_id,'quantity',v_qty,'message','تم حفظ حركة المخزون على الخادم');
        elsif p_action='SETTLE_SUPPLIER' then
          v_amount := (p_payload->>'amount')::numeric;
          if v_amount is null or v_amount<=0 then raise exception 'AGENT_INVALID_AMOUNT'; end if;
          if p_payload->>'supplierId' is null then select count(*) into v_match_count from jsonb_array_elements(v_suppliers) e where lower(e->>'name')=lower(p_payload->>'supplierName'); if v_match_count > 1 then raise exception 'AGENT_SUPPLIER_AMBIGUOUS'; end if; end if;
          select e into v_supplier from jsonb_array_elements(v_suppliers) e where (p_payload->>'supplierId' is not null and e->>'id'=p_payload->>'supplierId') or (p_payload->>'supplierId' is null and lower(e->>'name')=lower(p_payload->>'supplierName')) limit 1;
          if v_supplier is null then raise exception 'AGENT_SUPPLIER_NOT_FOUND'; end if;
          v_number := 'SP-AI-'||substr(v_id,4,8);
          select jsonb_agg(case when e->>'id'=v_supplier->>'id' then jsonb_set(jsonb_set(jsonb_set(e,'{balance}',to_jsonb(greatest(0,coalesce((e->>'balance')::numeric,0)-v_amount)),true),'{totalPaid}',to_jsonb(coalesce((e->>'totalPaid')::numeric,0)+v_amount),true),'{storeCredit}',to_jsonb(coalesce((e->>'storeCredit')::numeric,0)+greatest(0,v_amount-coalesce((e->>'balance')::numeric,0))),true) else e end) into v_suppliers from jsonb_array_elements(v_suppliers) e;
          v_supplier_payments := jsonb_build_array(jsonb_build_object('id',v_id,'paymentNumber',v_number,'supplierId',v_supplier->>'id','supplierName',v_supplier->>'name','amount',v_amount,'paymentDate',v_date,'paymentMethod',v_method,'treasurySource',coalesce(p_payload->>'treasurySource','الخزينة الرئيسية'),'notes','Executed via MALVIA AI Agent','recordedBy',v_name))||v_supplier_payments;
          select coalesce(sum(case when e->>'type'='قبض' then (e->>'amount')::numeric else -((e->>'amount')::numeric) end),0) into v_balance from jsonb_array_elements(v_treasury) e;
          v_treasury := jsonb_build_array(jsonb_build_object('id',v_id||'-TX','txNumber',v_number,'date',v_date,'time',v_time,'type','صرف','category','سداد دفعة لمورد','amount',v_amount,'paymentMethod',v_method,'balanceAfter',v_balance-v_amount,'referenceId',v_id,'description','سداد مورد عبر MALVIA AI Agent: '||(v_supplier->>'name'),'recordedBy',v_name,'at',v_now))||v_treasury;
          v_result := jsonb_build_object('success',true,'action',p_action,'operationId',v_id,'documentNumber',v_number,'amount',v_amount,'message','تم حفظ سداد المورد على الخادم');
        elsif p_action='COLLECT_CUSTOMER' then
          v_amount := (p_payload->>'amount')::numeric;
          if v_amount is null or v_amount<=0 then raise exception 'AGENT_INVALID_AMOUNT'; end if;
          if p_payload->>'customerId' is null then select count(*) into v_match_count from jsonb_array_elements(v_customers) e where lower(e->>'name')=lower(p_payload->>'customerName'); if v_match_count > 1 then raise exception 'AGENT_CUSTOMER_AMBIGUOUS'; end if; end if;
          select e into v_customer from jsonb_array_elements(v_customers) e where (p_payload->>'customerId' is not null and e->>'id'=p_payload->>'customerId') or (p_payload->>'customerId' is null and lower(e->>'name')=lower(p_payload->>'customerName')) limit 1;
          if v_customer is null then raise exception 'AGENT_CUSTOMER_NOT_FOUND'; end if;
          select jsonb_agg(case when e->>'id'=v_customer->>'id' then jsonb_set(jsonb_set(e,'{balance}',to_jsonb(greatest(0,coalesce((e->>'balance')::numeric,0)-v_amount)),true),'{lastPaymentDate}',to_jsonb(v_date),true) else e end) into v_customers from jsonb_array_elements(v_customers) e;
          select coalesce(sum(case when e->>'type'='قبض' then (e->>'amount')::numeric else -((e->>'amount')::numeric) end),0) into v_balance from jsonb_array_elements(v_treasury) e;
          v_treasury := jsonb_build_array(jsonb_build_object('id',v_id||'-TX','txNumber','COL-AI-'||substr(v_id,4,8),'date',v_date,'time',v_time,'type','قبض','category','تحصيل من عميل / ورشة','amount',v_amount,'paymentMethod',v_method,'balanceAfter',v_balance+v_amount,'referenceId',v_id,'description','تحصيل من العميل عبر MALVIA AI Agent: '||(v_customer->>'name'),'recordedBy',v_name,'at',v_now))||v_treasury;
          v_result := jsonb_build_object('success',true,'action',p_action,'operationId',v_id,'documentNumber','COL-AI-'||substr(v_id,4,8),'amount',v_amount,'message','تم حفظ التحصيل على الخادم');
        elsif p_action='ADD_PURCHASE' then
          v_qty := (p_payload->>'quantity')::numeric;
          if v_qty is null or v_qty<=0 or v_qty<>trunc(v_qty) then raise exception 'AGENT_INVALID_QUANTITY'; end if;
          select e into v_part from jsonb_array_elements(v_parts) e where e->>'id'=p_payload->>'partId' limit 1;
          if v_part is null then raise exception 'AGENT_PART_NOT_FOUND'; end if;
          select count(*) into v_match_count from jsonb_array_elements(v_suppliers) e where lower(e->>'name')=lower(p_payload->>'supplierName');
          if v_match_count > 1 then raise exception 'AGENT_SUPPLIER_AMBIGUOUS'; end if;
          select e into v_supplier from jsonb_array_elements(v_suppliers) e where lower(e->>'name')=lower(p_payload->>'supplierName') limit 1;
          if v_supplier is null then raise exception 'AGENT_SUPPLIER_NOT_FOUND'; end if;
          v_amount := (p_payload->>'unitCost')::numeric;
          if v_amount is null or v_amount<=0 then raise exception 'AGENT_INVALID_AMOUNT'; end if;
          v_total := v_amount*v_qty;
          v_id := 'AI-' || upper(substr(md5(clock_timestamp()::text || random()::text),1,16));
          v_number := 'PUR-AI-'||substr(v_id,4,8);
          v_stock := coalesce((v_part->>'stockQuantity')::numeric,0);
          select jsonb_agg(case when e->>'id'=v_part->>'id' then jsonb_set(jsonb_set(jsonb_set(e,'{stockQuantity}',to_jsonb(v_stock+v_qty),true),'{costPrice}',to_jsonb(v_amount),true),'{updatedAt}',to_jsonb(v_date),true) else e end) into v_parts from jsonb_array_elements(v_parts) e;
          v_row := jsonb_build_object('id',v_id,'invoiceNumber',v_number,'date',v_date,'time',v_time,'supplierId',v_supplier->>'id','supplierName',v_supplier->>'name','items',jsonb_build_array(jsonb_build_object('partId',v_part->>'id','partNumber',v_part->>'partNumber','partName',v_part->>'name','category',coalesce(v_part->>'category','فلاتر وزيوت'),'quantity',v_qty,'costPrice',v_amount,'salePrice',coalesce((v_part->>'salePrice')::numeric,0),'total',v_total)),'subtotal',v_total,'tax',0,'discount',0,'grandTotal',v_total,'paymentStatus',case when lower(v_method) not like '%آجل%' and lower(v_method) not like '%اجل%' and lower(v_method) not like '%حساب ورشة%' then 'مدفوعة نقداً' else 'آجل' end,'amountPaid',case when lower(v_method) not like '%آجل%' and lower(v_method) not like '%اجل%' and lower(v_method) not like '%حساب ورشة%' then v_total else 0 end,'remainingBalance',case when lower(v_method) not like '%آجل%' and lower(v_method) not like '%اجل%' and lower(v_method) not like '%حساب ورشة%' then 0 else v_total end,'paymentMethod',v_method,'notes','Executed via MALVIA AI Agent','receivedBy',v_name);
          v_purchase_invoices := jsonb_build_array(v_row)||v_purchase_invoices;
          select jsonb_agg(case when e->>'id'=v_supplier->>'id' then jsonb_set(jsonb_set(jsonb_set(jsonb_set(e,'{balance}',to_jsonb(coalesce((e->>'balance')::numeric,0)+case when lower(v_method) like '%آجل%' or lower(v_method) like '%اجل%' or lower(v_method) like '%حساب ورشة%' then v_total else 0 end),true),'{totalSupplied}',to_jsonb(coalesce((e->>'totalSupplied')::numeric,0)+v_total),true),'{totalPaid}',to_jsonb(coalesce((e->>'totalPaid')::numeric,0)+case when lower(v_method) like '%آجل%' or lower(v_method) like '%اجل%' or lower(v_method) like '%حساب ورشة%' then 0 else v_total end),true),'{deferredDebt}',to_jsonb(coalesce((e->>'deferredDebt')::numeric,0)+case when lower(v_method) like '%آجل%' or lower(v_method) like '%اجل%' or lower(v_method) like '%حساب ورشة%' then v_total else 0 end),true) else e end) into v_suppliers from jsonb_array_elements(v_suppliers) e;
          v_moves := jsonb_build_array(jsonb_build_object('id',v_id||'-MOV','at',v_now,'partId',v_part->>'id','partNumber',v_part->>'partNumber','partName',v_part->>'name','type','purchase','qtyDelta',v_qty,'balanceAfter',v_stock+v_qty,'refId',v_id,'refNumber',v_number,'userName',v_name))||v_moves;
          if lower(v_method) not like '%آجل%' and lower(v_method) not like '%اجل%' and lower(v_method) not like '%حساب ورشة%' then
            select coalesce(sum(case when e->>'type'='قبض' then (e->>'amount')::numeric else -((e->>'amount')::numeric) end),0) into v_balance from jsonb_array_elements(v_treasury) e;
            v_treasury := jsonb_build_array(jsonb_build_object('id',v_id||'-TX','txNumber',v_number,'date',v_date,'time',v_time,'type','صرف','category','فاتورة مشتريات نقدية','amount',v_total,'paymentMethod',v_method,'balanceAfter',v_balance-v_total,'referenceId',v_id,'description','فاتورة توريد نقدية عبر MALVIA AI Agent: '||(v_supplier->>'name'),'recordedBy',v_name,'at',v_now))||v_treasury;
          end if;
          v_result := jsonb_build_object('success',true,'action',p_action,'operationId',v_id,'documentNumber',v_number,'amount',v_total,'quantity',v_qty,'message','تم حفظ فاتورة التوريد على الخادم');
        else raise exception 'AGENT_ACTION_NOT_ALLOWED'; end if;
        if p_action in ('ADD_EXPENSE','SETTLE_SUPPLIER','ADD_PURCHASE') and lower(v_method) not like '%آجل%' and lower(v_method) not like '%اجل%' and lower(v_method) not like '%حساب ورشة%' then
          if v_shift_id is null then select e->>'id' into v_shift_id from jsonb_array_elements(v_shifts) e where e->>'status'='مفتوحة' order by e->>'openedAt' limit 1; end if;
          if v_shift_id is not null then
            select jsonb_agg(case when e->>'id'=v_shift_id then jsonb_set(e,'{cashOut}',to_jsonb(coalesce((e->>'cashOut')::numeric,0)+case when p_action='ADD_PURCHASE' then v_total else v_amount end),true) else e end) into v_shifts from jsonb_array_elements(v_shifts) e;
          end if;
        end if;
        -- All document mutations and the idempotency receipt commit in this same DB transaction.
        if p_action in ('EXECUTE_SALE','RESTOCK_ITEM','ADD_PURCHASE') then
          insert into malvia_docs(tenant,resource,data,version) values(p_tenant,'parts',coalesce(v_parts,'[]'::jsonb),1) on conflict(tenant,resource) do update set data=excluded.data,version=malvia_docs.version+1,updated_at=now();
        end if;
        if p_action='EXECUTE_SALE' then insert into malvia_docs(tenant,resource,data,version) values(p_tenant,'invoices',v_invoices,1) on conflict(tenant,resource) do update set data=excluded.data,version=malvia_docs.version+1,updated_at=now(); end if;
        if p_action='EXECUTE_SALE' and v_customer is not null then insert into malvia_docs(tenant,resource,data,version) values(p_tenant,'customers',v_customers,1) on conflict(tenant,resource) do update set data=excluded.data,version=malvia_docs.version+1,updated_at=now(); end if;
        if v_shift_id is not null and p_action in ('EXECUTE_SALE','ADD_EXPENSE','SETTLE_SUPPLIER','ADD_PURCHASE') then insert into malvia_docs(tenant,resource,data,version) values(p_tenant,'shifts',v_shifts,1) on conflict(tenant,resource) do update set data=excluded.data,version=malvia_docs.version+1,updated_at=now(); end if;
        if p_action='ADD_EXPENSE' then insert into malvia_docs(tenant,resource,data,version) values(p_tenant,'expenses',v_expenses,1) on conflict(tenant,resource) do update set data=excluded.data,version=malvia_docs.version+1,updated_at=now(); end if;
        if p_action in ('SETTLE_SUPPLIER','ADD_PURCHASE') then insert into malvia_docs(tenant,resource,data,version) values(p_tenant,'suppliers',v_suppliers,1) on conflict(tenant,resource) do update set data=excluded.data,version=malvia_docs.version+1,updated_at=now(); end if;
        if p_action='SETTLE_SUPPLIER' then insert into malvia_docs(tenant,resource,data,version) values(p_tenant,'supplierPayments',v_supplier_payments,1) on conflict(tenant,resource) do update set data=excluded.data,version=malvia_docs.version+1,updated_at=now(); end if;
        if p_action='ADD_PURCHASE' then insert into malvia_docs(tenant,resource,data,version) values(p_tenant,'purchaseInvoices',v_purchase_invoices,1) on conflict(tenant,resource) do update set data=excluded.data,version=malvia_docs.version+1,updated_at=now(); end if;
        if p_action='COLLECT_CUSTOMER' then insert into malvia_docs(tenant,resource,data,version) values(p_tenant,'customers',v_customers,1) on conflict(tenant,resource) do update set data=excluded.data,version=malvia_docs.version+1,updated_at=now(); end if;
        if p_action in ('EXECUTE_SALE','ADD_EXPENSE','SETTLE_SUPPLIER','COLLECT_CUSTOMER') or (p_action='ADD_PURCHASE' and lower(v_method) not like '%آجل%' and lower(v_method) not like '%اجل%' and lower(v_method) not like '%حساب ورشة%') then insert into malvia_docs(tenant,resource,data,version) values(p_tenant,'treasury',v_treasury,1) on conflict(tenant,resource) do update set data=excluded.data,version=malvia_docs.version+1,updated_at=now(); end if;
        if p_action in ('EXECUTE_SALE','RESTOCK_ITEM','ADD_EXPENSE','SETTLE_SUPPLIER','COLLECT_CUSTOMER','ADD_PURCHASE') then
          v_audit := jsonb_build_array(jsonb_build_object('id',v_id||'-AUD','at',v_now,'userId',v_emp_id,'userName',v_name,'userRole',v_role,'action',case p_action when 'EXECUTE_SALE' then 'invoice.create' when 'RESTOCK_ITEM' then 'stock.adjust' when 'SETTLE_SUPPLIER' then 'supplier.payment' when 'COLLECT_CUSTOMER' then 'customer.collect' when 'ADD_PURCHASE' then 'purchase.create' else 'expense.create' end,'entityId',v_id,'summary','Executed via MALVIA AI Agent','amount',coalesce(v_total,v_amount,0)))||v_audit;
          insert into malvia_docs(tenant,resource,data,version) values(p_tenant,'auditLog',v_audit,1) on conflict(tenant,resource) do update set data=excluded.data,version=malvia_docs.version+1,updated_at=now();
        end if;
        if p_action in ('EXECUTE_SALE','RESTOCK_ITEM','ADD_PURCHASE') then insert into malvia_docs(tenant,resource,data,version) values(p_tenant,'stockMovements',v_moves,1) on conflict(tenant,resource) do update set data=excluded.data,version=malvia_docs.version+1,updated_at=now(); end if;
        insert into malvia_agent_ops(tenant,idempotency_key,result) values(p_tenant,p_key,v_result);
        return v_result;
      end $$`;
      await q`create or replace function malvia_put_if_version(p_tenant text, p_resource text, p_data jsonb, p_base_version bigint)
      returns bigint language plpgsql as $$
      declare v_version bigint;
      begin
        perform pg_advisory_xact_lock(hashtext(p_tenant));
        if p_base_version = 0 then
          insert into malvia_docs(tenant,resource,data,version) values(p_tenant,p_resource,p_data,1)
          on conflict(tenant,resource) do nothing returning version into v_version;
          return v_version;
        end if;
        update malvia_docs set data=p_data, version=version+1, updated_at=now()
          where tenant=p_tenant and resource=p_resource and version=p_base_version returning version into v_version;
        return v_version;
      end $$`;
    })();
  }
  return ready;
}

export async function getAll(tenant: string): Promise<Record<string, Row>> {
  await init();
  const rows = await (await sql())`select resource, data, version from malvia_docs where tenant = ${tenant}`;
  const out: Record<string, Row> = {};
  for (const r of rows as any[]) out[r.resource] = { data: r.data, version: Number(r.version) };
  return out;
}

export async function getOne(tenant: string, resource: string): Promise<Row | null> {
  await init();
  const rows = await (await sql())`select data, version from malvia_docs where tenant = ${tenant} and resource = ${resource}`;
  const r = (rows as any[])[0];
  return r ? { data: r.data, version: Number(r.version) } : null;
}

// كتابة مشروطة بالإصدار (optimistic concurrency). ترجع الإصدار الجديد أو null عند التعارض.
export async function putIfVersion(tenant: string, resource: string, data: unknown, baseVersion: number): Promise<number | null> {
  await init();
  const q = await sql();
  const rows = await q`select malvia_put_if_version(${tenant},${resource},${JSON.stringify(data)}::jsonb,${baseVersion}::bigint) as version`;
  const version = (rows as any[])[0]?.version;
  return version == null ? null : Number(version);
}


export async function createEmployeeSession(tenant: string, employeeId: string, tokenHash: string, expiresAt: Date): Promise<void> {
  await init();
  const q = await sql();
  await q`insert into malvia_employee_sessions(token_hash,tenant,employee_id,expires_at) values(${tokenHash},${tenant},${employeeId},${expiresAt.toISOString()})`;
}

export async function getAuthenticatedEmployee(tenant: string, tokenHash: string): Promise<any | null> {
  await init();
  const q = await sql();
  const sessions = await q`select employee_id from malvia_employee_sessions where token_hash=${tokenHash} and tenant=${tenant} and revoked_at is null and expires_at > now() limit 1`;
  const employeeId = (sessions as any[])[0]?.employee_id;
  if (!employeeId) return null;
  const row = await getOne(tenant, 'employees');
  const employees = Array.isArray(row?.data) ? row!.data as any[] : [];
  return employees.find((e) => e?.id === employeeId && e?.status !== 'معلق') || null;
}

export async function executeAgentOperation(tenant: string, tokenHash: string, idempotencyKey: string, action: string, payload: unknown): Promise<any> {
  await init();
  const q = await sql();
  const rows = await q`select malvia_agent_execute(${tenant},${tokenHash},${idempotencyKey},${action},${JSON.stringify(payload)}::jsonb) as result`;
  return (rows as any[])[0]?.result;
}

// ---------------------------------------------------------------- النسخ الاحتياطي
// كل نسخة = لقطة كاملة لكل موارد المحل (data + version) في صف واحد.
// الاحتفاظ: آخر 14 نسخة تلقائية، وآخر 10 يدوية، وآخر 5 قبل-الاسترجاع لكل محل (لتوفير مساحة الخطة المجانية).

export interface BackupMeta { id: number; kind: string; created_at: string; size_bytes: number; resources: number }

const KEEP: Record<string, number> = { auto: 14, manual: 10, 'pre-restore': 5 };

/** نسخة تلقائية لكل محل تغيّرت بياناته منذ آخر نسخة (يشمل سجل التراخيص). ترجع عدد النسخ المنشأة. */
export async function backupAllChanged(): Promise<number> {
  await init();
  const q = await sql();
  const rows = await q`
    insert into malvia_backups (tenant, kind, docs, size_bytes)
    select d.tenant, 'auto',
           jsonb_object_agg(d.resource, jsonb_build_object('data', d.data, 'version', d.version)),
           sum(pg_column_size(d.data))
    from malvia_docs d
    group by d.tenant
    having max(d.updated_at) > coalesce((select max(b.created_at) from malvia_backups b where b.tenant = d.tenant), 'epoch'::timestamptz)
    returning id`;
  await pruneBackups();
  return (rows as any[]).length;
}

/** نسخة فورية لمحل واحد (يدوية أو قبل الاسترجاع). ترجع رقم النسخة أو null إن لم توجد بيانات. */
export async function createBackup(tenant: string, kind: 'manual' | 'pre-restore'): Promise<number | null> {
  await init();
  const q = await sql();
  const rows = await q`
    insert into malvia_backups (tenant, kind, docs, size_bytes)
    select d.tenant, ${kind}::text,
           jsonb_object_agg(d.resource, jsonb_build_object('data', d.data, 'version', d.version)),
           sum(pg_column_size(d.data))
    from malvia_docs d
    where d.tenant = ${tenant}
    group by d.tenant
    returning id`;
  const r = (rows as any[])[0];
  if (!r) return null;
  await pruneBackups(tenant);
  return Number(r.id);
}

export async function pruneBackups(tenant?: string) {
  const q = await sql();
  for (const [kind, keep] of Object.entries(KEEP)) {
    await q`delete from malvia_backups b
      where b.kind = ${kind} and (${tenant ?? null}::text is null or b.tenant = ${tenant ?? null})
        and b.id not in (
          select id from (
            select id, row_number() over (partition by tenant order by created_at desc) rn
            from malvia_backups where kind = ${kind}
          ) x where x.rn <= ${keep}
        )`;
  }
}

export async function listBackups(tenant: string): Promise<BackupMeta[]> {
  await init();
  const rows = await (await sql())`
    select id, kind, created_at, size_bytes, (select count(*) from jsonb_object_keys(docs)) as resources
    from malvia_backups where tenant = ${tenant} order by created_at desc limit 60`;
  return (rows as any[]).map(r => ({
    id: Number(r.id), kind: r.kind, created_at: new Date(r.created_at).toISOString(),
    size_bytes: Number(r.size_bytes), resources: Number(r.resources),
  }));
}

export async function getBackup(id: number): Promise<{ tenant: string; kind: string; created_at: string; docs: Record<string, { data: unknown; version: number }> } | null> {
  await init();
  const rows = await (await sql())`select tenant, kind, created_at, docs from malvia_backups where id = ${id}`;
  const r = (rows as any[])[0];
  return r ? { tenant: r.tenant, kind: r.kind, created_at: new Date(r.created_at).toISOString(), docs: r.docs } : null;
}

/**
 * استرجاع محل واحد من نسخة: يأخذ نسخة "قبل-الاسترجاع" أولاً (لإمكانية التراجع)، ثم يستبدل بيانات هذا المحل فقط
 * داخل معاملة واحدة. الإصدارات تزيد حتى تلتقط الأجهزة التغيير في المزامنة التالية.
 */
export async function restoreBackup(id: number, tenant: string): Promise<{ preRestoreId: number | null; resources: number }> {
  const b = await getBackup(id);
  if (!b) throw new Error('النسخة غير موجودة');
  if (b.tenant !== tenant) throw new Error('هذه النسخة تخص محلاً آخر');
  const preRestoreId = await createBackup(tenant, 'pre-restore');
  const q = await sql();
  const names = Object.keys(b.docs);
  const stmts: any[] = names.map(r =>
    q`insert into malvia_docs (tenant, resource, data, version)
      values (${tenant}, ${r}, ${JSON.stringify(b.docs[r].data)}::jsonb, 1)
      on conflict (tenant, resource) do update
      set data = excluded.data, version = malvia_docs.version + 1, updated_at = now()`
  );
  stmts.push(q`delete from malvia_docs where tenant = ${tenant} and not (resource = any(${names}))`);
  await q.transaction(stmts);
  return { preRestoreId, resources: names.length };
}

export async function listTenantsWithData(): Promise<string[]> {
  await init();
  const rows = await (await sql())`select distinct tenant from malvia_docs order by tenant`;
  return (rows as any[]).map(r => String(r.tenant));
}
