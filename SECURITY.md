# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- **Secrets**: the Grocy API key is a `secret` field of the Gladys
  configuration. The integration reads it from Gladys at startup, keeps it in
  memory, sends it only to the Grocy address of the configuration (in the
  `GROCY-API-KEY` header), and never writes it to `/data` nor to the logs. It
  acts with the rights of the Grocy user who owns the key: a dedicated user is
  a good idea.
- **Stored in `/data`**: `grocy-state.json`, the products and chores already
  announced to the scenes (Grocy ids and dates, no names) and the address of
  the Grocy they belong to. Nothing else.
- **Network**: requests go only to the Grocy address typed in the
  configuration, on the local network, in HTTP or HTTPS. HTTPS certificates
  are verified unless the user ticks "Accept self-signed certificates"; no
  redirect is followed; the integration opens no port and calls no cloud
  service.
- **Writes to Grocy**: only the scene actions and widget buttons write
  (consume, add to the shopping list, track a chore or a charge cycle,
  complete a task), each one undone from Grocy. Nothing is deleted.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
Grocy itself (see its [repository](https://github.com/grocy/grocy)), and the
other devices and services of your network.
