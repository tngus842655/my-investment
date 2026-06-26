import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ADMIN_EMAIL = 'tngus842655@gmail.com'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // 호출자가 관리자인지 확인
  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
  }
  const { data: { user: callerUser } } = await supabaseAdmin.auth.admin.getUserById(user.id)
  if (!callerUser || callerUser.email !== ADMIN_EMAIL) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders })
  }

  const { email, newPassword } = await req.json()
  if (!email || !newPassword) {
    return new Response(JSON.stringify({ error: 'email and newPassword required' }), { status: 400, headers: corsHeaders })
  }
  if (newPassword.length < 6) {
    return new Response(JSON.stringify({ error: '비밀번호는 6자 이상이어야 합니다.' }), { status: 400, headers: corsHeaders })
  }

  // 이메일로 유저 조회
  const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers()
  if (listError) {
    return new Response(JSON.stringify({ error: listError.message }), { status: 500, headers: corsHeaders })
  }

  const target = users.find((u) => u.email === email)
  if (!target) {
    return new Response(JSON.stringify({ error: '가입되지 않은 이메일입니다.' }), { status: 404, headers: corsHeaders })
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(target.id, {
    password: newPassword,
  })
  if (updateError) {
    return new Response(JSON.stringify({ error: updateError.message }), { status: 500, headers: corsHeaders })
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
