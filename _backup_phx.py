import shutil,time
p='/var/lib/jamddmaj-perps-runtime/phoenix.sqlite'
b=p+'.bak-historical-20261123'
shutil.copy2(p,b)
print('backup',b)
