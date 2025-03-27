#!/bin/bash

if [ $# -ne 2 ]; then
    echo "$0: usage ./launch_traceroute.sh <src_grp> <dst_ip>"
    exit 1
fi

trap "exit" SIGINT

src_grp=$1
dst_ip=$2

# Output directory and timestamp
output_dir="/root/${src_grp}/${dst_ip}"
mkdir -p "$output_dir"
timestamp=$(date "+%Y-%m-%dT%H-%M-%S")
output_file="${output_dir}/traceroute_${timestamp}.json"

# Run traceroute and parse output
traceroute_output=$(traceroute -i group${src_grp} "${dst_ip}")

# Begin JSON array
echo "[" > "$output_file"

# Parse each hop line (skipping the header line)
echo "$traceroute_output" | tail -n +2 | awk '
BEGIN { hop=0 }
{
  hop++
  ip = ""
  hostname = ""
  rtt = ""

  if ($2 == "*") {
    ip = "*"
    hostname = "*"
    rtt = "null"
  } else {
    hostname = $2
    ip = $3
    gsub("[()]", "", ip)
    for (i = 4; i <= NF; i++) {
      if ($i ~ /^[0-9.]+$/) {
        rtt = $i
        break
      }
    }
  }

  printf "  {\"hop\": %d, \"hostname\": \"%s\", \"ip\": \"%s\", \"rtt_ms\": %s}", hop, hostname, ip, (rtt == "" ? "null" : rtt)

  # add comma if not last line
  if (NR > 1 && NR != ENVIRON["TRACEROUTE_HOP_COUNT"])
    printf ","
  printf "\n"
}
' TRACEROUTE_HOP_COUNT=$(echo "$traceroute_output" | wc -l) >> "$output_file"

# End JSON array
echo "]" >> "$output_file"

echo "Traceroute JSON saved to $output_file"



# for hop in `seq 30`
# do
#     echo -e 'Hop '$hop':  \c'
#     nping --interface group_"${src_grp}" --source-ip "${src_grp}".0.199.2 --dest-ip "${dst_ip}" --tr --ttl "${hop}" -c 1 -H --delay 100ms 2> /dev/null | grep RCVD | cut -f 4,7,8,9 -d ' ' | cut -f 2 -d '['
# done
