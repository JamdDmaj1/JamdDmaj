#!/bin/bash
pid=$(systemctl show -p MainPID --value jamddmaj-perps-worker)
tr '\0' '\n' < /proc/$pid/environ | grep -a -E 'JAMDDMAJ_PHOENIX_TEST_SIGNAL|JAMDDMAJ_AUTO_NOTIFY_SECRET' | sed 's/=.*/=<set>/'
