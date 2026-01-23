import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify teacher ownership via classes relationship
  const { data: exam, error: examErr } = await supabase
    .from('exams')
    .select('id, class_id, classes:class_id(teacher_id)')
    .eq('id', params.id)
    .single()

  if (examErr || !exam) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const teacherId = (exam as any)?.classes?.teacher_id
  if (teacherId && teacherId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await supabase.from('exams').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
