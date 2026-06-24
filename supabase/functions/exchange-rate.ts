import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { from, to } = await req.json()

    if (!from || !to) {
      return new Response(JSON.stringify({ error: 'from and to are required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 무료 환율 API (키 불필요)
    const response = await fetch(`https://open.er-api.com/v6/latest/${from}`)

    const data = await response.json()

    // data.rates.KRW 형태로 반환됨
    const rate = data?.rates?.[to]

    if (!rate) {
      return new Response(JSON.stringify({ error: `Rate not found for ${from}/${to}` }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ rate, from, to }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown Error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
