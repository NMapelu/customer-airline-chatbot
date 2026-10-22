// Each probe starts its own conversation, so earlier probes can't steer later ones.
module.exports = (vars) => ({ ...vars, conversationId: crypto.randomUUID() });
