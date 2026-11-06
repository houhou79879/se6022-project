"""Opaque, permission-derived home paths for the teaching sandbox.

The Agent must not be able to infer ownership or write scope from a path such
as ``users/alice``.  Each logical employee is therefore mapped to
``users/<hmac>`` where the HMAC covers the employee identity and the ACL profile.
The mapping is deterministic for the lab, stable across sessions, and stored
without exposing the reverse mapping to the model.
"""
import hashlib
import hmac

# A lab-only pepper. The Agent never receives this value; it only sees the
# resulting opaque directory name. This is not a production secret store.
_PEPPER = b'fileagent-se6022-opaque-home-v1'
_ACL = 'read:shared|read:own|write:own'


def home(user):
    """Return the opaque home directory for a logical employee."""
    digest = hmac.new(_PEPPER, f'{user}|{_ACL}'.encode('utf-8'), hashlib.sha256).hexdigest()
    return f'users/{digest[:20]}'


def user_path(user, relative=''):
    """Return an opaque path inside a logical employee's home."""
    relative = relative.lstrip('/')
    return f'{home(user)}/{relative}' if relative else home(user)


ALICE_HOME = home('alice')
BOB_HOME = home('bob')
