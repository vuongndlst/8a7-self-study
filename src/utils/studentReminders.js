const REFLECTION_DUE = new Set(['Đang chờ cập nhật', 'Trễ hạn cập nhật'])

export function isReflectionDue(progress) {
  return REFLECTION_DUE.has(progress)
}

export function reflectionReminder(plans = [], reflections = {}, status = {}) {
  const due = plans.filter((plan) => !reflections[plan.id] && isReflectionDue(status[plan.id]?.progress))
  const overdue = due.filter((plan) => status[plan.id]?.progress === 'Trễ hạn cập nhật')

  return {
    total: due.length,
    pending: due.length - overdue.length,
    overdue: overdue.length,
    planIds: new Set(due.map((plan) => plan.id)),
  }
}
